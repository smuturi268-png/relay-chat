import { writeFile } from 'node:fs/promises'
import { deflateSync } from 'node:zlib'

function crc32(buf) {
  let crc = 0xffffffff
  for (const byte of buf) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const name = Buffer.from(type)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])))
  return Buffer.concat([length, name, data, crc])
}

function createPng(size) {
  const pixels = Buffer.alloc(size * size * 4)
  const dark = [23, 24, 31, 255]
  const purple = [108, 99, 255, 255]
  const white = [255, 255, 255, 255]
  const inside = (x, y, cx, cy, rx, ry) => ((x-cx)*(x-cx))/(rx*rx) + ((y-cy)*(y-cy))/(ry*ry) <= 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let color = dark
      const sx = x / size, sy = y / size
      const inBubble = inside(sx, sy, .5, .5, .31, .28)
      if (inside(sx, sy, .21875, .21875, .21875, .21875) || inside(sx, sy, .78125, .21875, .21875, .21875)) {
        color = dark
      } else if (inBubble) {
        color = purple
      }
      if (inside(sx, sy, .406, .5, .05, .05) || inside(sx, sy, .594, .5, .05, .05)) color = white
      if (inside(sx, sy, .5, .68, .14, .07) && sx > .36 && sx < .64 && sy > .63) color = white
      const i = (y * size + x) * 4
      pixels[i] = color[0]; pixels[i+1] = color[1]; pixels[i+2] = color[2]; pixels[i+3] = color[3]
    }
  }

  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) raw.set(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]), y * (size * 4 + 1))
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    pngChunk('IHDR', header), pngChunk('IDAT', deflateSync(raw)), pngChunk('IEND', Buffer.alloc(0))
  ])
}

await writeFile('public/icon-192.png', createPng(192))
await writeFile('public/icon-512.png', createPng(512))
