import path from 'path'
import fs from 'fs-extra'
import fetch from 'node-fetch'
import StreamZip from 'node-stream-zip'

type Arch = 'x86' | 'x64'

const ARCH_MAP: { [key: string]: Arch } = {
  ia32: 'x86',
  x32: 'x86',
  x64: 'x64',
}

interface Env {
  readonly arch: Arch
  readonly GROONGA_PATH?: string
}

class WinEnv implements Env {
  readonly arch: Arch
  readonly GROONGA_PATH?: string

  constructor() {
    const arch = ARCH_MAP[process.arch]
    if (arch == null) {
      throw new Error(`unexpected architecture: ${process.arch}`)
    }
    this.arch = arch
    const key = `NRN_GROONGA_PATH_WIN_${arch}`
    this.GROONGA_PATH = process.env[key]
  }
}

const WIN_ARCHIVES_URL = 'https://packages.groonga.org/windows/groonga/'

export class PreInstall {
  readonly env: Env

  constructor(env: Env) {
    this.env = env
  }

  async main() {
    const winGrnDir = path.join(__dirname, 'groonga')
    const tempDir = path.join(__dirname, 'temp')

    fs.removeSync(winGrnDir)
    fs.removeSync(tempDir)

    if (this.env.GROONGA_PATH) {
      const ok = this.checkGroongaDir(this.env.GROONGA_PATH)
      
      if (ok) {
        console.log(`copy ${this.env.GROONGA_PATH}`)
        fs.copySync(this.env.GROONGA_PATH, winGrnDir)
        return
      } else {
        console.log(`invalid groonga path: ${this.env.GROONGA_PATH}`)
      }
    }

    try {
      const grnDir = await this.getGroonga(tempDir)
      fs.moveSync(grnDir, winGrnDir)
      fs.removeSync(tempDir)
    } catch (err) {
      fs.removeSync(tempDir)
      throw err
    }
  }

  async getGroonga(tempDir: string): Promise<string> {
    const archivesPage = await this.getArchivesPage()

    const zipName = this.getTargetZipName(archivesPage)

    if (zipName == null) {
      const msg = `can't find target zip file in ${WIN_ARCHIVES_URL}`
      console.log(msg)
      throw new Error(msg)
    } else {
      console.log(`zip: ${zipName}`)
      if (!fs.existsSync(tempDir)) {
        fs.mkdir(tempDir)
      }

      await this.downloadZip(zipName, tempDir)
      const zip = path.join(tempDir, zipName)

      const grnDir = await this.extractZip(zip, tempDir)

      return grnDir
    }
  }

  checkGroongaDir(dir: string): boolean {
    const results: Array<boolean> = []
    results.push(fs.existsSync(path.join(dir, 'include', 'groonga', 'groonga.h')))
    results.push(fs.existsSync(path.join(dir, 'lib', 'libgroonga.lib')))
    results.push(fs.existsSync(path.join(dir, 'bin', 'libgroonga.dll')))
    return results.every((v) => v)
  }

  async getArchivesPage(): Promise<string> {
    const response = await fetch(WIN_ARCHIVES_URL).catch((err) => {
      throw err
    })

    const type = response.headers.get('content-type')
    if (type == null || !type.match(/text\/html/)) {
      console.log('unexpected response')
      throw new Error('unexpected response')
    }

    const html = await response.text().catch((err) => {
      throw err
    })

    return html
  }

  getTargetZipName(html: string): string | null {
    let filename: string | null = null

    if (html.match(new RegExp(`<a\\s+href="(groonga-latest-${this.env.arch}-vs[^-]+-with-vcruntime.zip)"`, 'i'))) {
      filename = RegExp.$1
    }
    
    return filename
  }

  downloadZip(zipName: string, dir: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      const zip = path.join(dir, zipName)
      const zipTemp = path.join(dir, zipName + '.temp')
      const zipUrl = `${WIN_ARCHIVES_URL}${zipName}`

      fetch(zipUrl)
        .then((response) => {
          if (!response.ok) {
            reject(new Error(`status: ${response.status}`))
            return
          }

          const len = response.headers.get('content-length')
          const total = len != null ? Number(len) : null
          let done = 0

          response.body
            .on('data', (chunk: Buffer) => {
              done += chunk.length
              this.writeProgressBar({ total, done })
            })
            .on('error', (err) => {
              this.clearProgressBar()
              console.log(err)
              reject(err)
            })
            .on('close', () => {
              this.clearProgressBar()
              reject(new Error('unexpected'))
            })
            .on('end', () => {
              this.clearProgressBar()
              console.log('Download complete')
              fs.renameSync(zipTemp, zip)
              resolve(true)
            })
            .pipe(fs.createWriteStream(zipTemp))
        })
        .catch((err) => {
          reject(err)
        })
    })
  }

  private spinner_index = 0

  private static readonly SPINNER = '┏┏┳┳┓┓┫┫┛┛┻┻┗┗┣┣'

  writeProgressBar(state: { total: number | null; done: number }) {
    const width = 40
    const parts = ['\r', 'downloading ', PreInstall.SPINNER.charAt(this.spinner_index), '  ']
    this.spinner_index = (this.spinner_index + 1) % PreInstall.SPINNER.length
    const done_mb = '    ' + (state.done / 1024 / 1024).toFixed(1).slice(-4)

    if (state.total == null) {
      parts.push(`(${done_mb}MB) `)
    } else {
      const percent = state.done / state.total
      const complete_width = Math.min(Math.round(width * (percent + 0.004)), width)

      const total_mb = (state.total / 1024 / 1024).toFixed(1)
      const w_mb = -1 * total_mb.length
      parts.push(
        '[',
        '='.repeat(complete_width),
        ' '.repeat(width - complete_width),
        '] ',
        ('   ' + Math.round(percent * 100)).slice(-3),
        '% (',
        ('    ' + done_mb).slice(w_mb),
        '/',
        ('    ' + total_mb).slice(w_mb),
        'MB) '
      )
    }

    process.stdout.write(parts.join(''))
  }

  clearProgressBar() {
    process.stdout.write('\n')
  }

  extractZip(zipPath: string, dir: string): Promise<string> {
    return new Promise((resolve, reject) => {
      console.log('extract zip')

      const zip = new StreamZip({
        file: zipPath,
        storeEntries: true,
      })

      zip.on('ready', () => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir)
        }

        zip.extract(null, dir, (err: any, count: number) => {
          console.log(err ? 'extract error' : `Extracted ${count} entries`)
          zip.close()

          if (err) {
            reject(new Error('extract error'))
            return
          }

          const gdir = this.findGroongaDir(dir)

          if (gdir == null) {
            const not_found_msg = 'groonga directory not found'
            console.log(not_found_msg)
            reject(new Error(not_found_msg))
            return
          } else {
            const ok = this.checkGroongaDir(gdir)
            const failed_msg = 'failed to get groonga'

            if (ok) {
              resolve(gdir)
              return
            } else {
              console.log(failed_msg)
              reject(new Error(failed_msg))
              return
            }
          }
        })
      })
    })
  }

  findGroongaDir(dir: string): string | null {
    try {
      const files = fs.readdirSync(dir)
      for (let file of files) {
        const child = path.join(dir, file)
        if (file.startsWith('groonga') && fs.existsSync(child) && fs.statSync(child).isDirectory()) {
          return child
        }
      }
    } catch (err) {
      throw err
    }

    return null
  }
}


if (process.platform === 'win32') {
  if (process.argv[1] === __filename) {
    const env = new WinEnv()
    const pre = new PreInstall(env)
    pre.main()
  }
}

/*!
 * nroonga helper script for windows
 * Licensed under nroonga's license
 *
 * Includes fs-extra
 * https://github.com/jprichardson/node-fs-extra
 * Copyright (c) 2011-2017 JP Richardson
 * Licensed under MIT license
 *
 * Includes node-fetch
 * https://github.com/bitinn/node-fetch
 * Copyright (c) 2016 David Frank
 * Licensed under MIT license
 *
 * Includes node-stream-zip
 * https://github.com/antelle/node-stream-zip
 * Copyright (c) 2015 Antelle https://github.com/antelle
 * Licensed under MIT license
 */
