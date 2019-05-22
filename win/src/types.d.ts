declare module "node-stream-zip" {
  class StreamZip {
    constructor(options: { file: string; storeEntries?: boolean })
    on(type: string, cb: () => void): void
    extract(a: any, b: string, cb: (err: any, count: number) => void): void
    close(): void
  }
  export = StreamZip
}
  