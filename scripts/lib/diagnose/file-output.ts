/**
 * File Output Utilities
 *
 * Writes diagnose results to /tmp/borglike-diagnose/ as .txt + .json files.
 * Agent reads .json for structured data; humans read .txt.
 */

import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

export const DEFAULT_OUTPUT_DIR = '/tmp/borglike-diagnose'

export interface DiagnoseOutputEnvelope {
  mode: string
  timestamp: string
  config: Record<string, unknown>
  result: unknown
}

/** Generate a timestamped filename: YYYYMMDD-HHMMSS-{mode}-{class}-{race}[-seedN][-Nruns] */
export function generateFileName(opts: {
  mode: string
  classId?: string
  race?: string
  seed?: number
  runs?: number
}): string {
  const now = new Date()
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
  const time = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`

  const parts = [date, time, opts.mode]
  if (opts.classId) parts.push(opts.classId)
  if (opts.race && opts.race !== 'human') parts.push(opts.race)
  if (opts.seed !== undefined) parts.push(`seed${opts.seed}`)
  if (opts.runs !== undefined) parts.push(`${opts.runs}runs`)

  return parts.join('-')
}

/** Write .txt and .json output files, return paths */
export function writeOutputFiles(opts: {
  dir: string
  baseName: string
  text: string
  json: DiagnoseOutputEnvelope
}): { txtPath: string; jsonPath: string } {
  mkdirSync(opts.dir, { recursive: true })
  const txtPath = join(opts.dir, `${opts.baseName}.txt`)
  const jsonPath = join(opts.dir, `${opts.baseName}.json`)

  writeFileSync(txtPath, opts.text, 'utf-8')
  // Strip non-serializable fields (analyzer class instances)
  const jsonStr = JSON.stringify(opts.json, (key, value) => {
    if (key === 'analyzers') return undefined
    return value
  }, 2)
  writeFileSync(jsonPath, jsonStr, 'utf-8')

  return { txtPath, jsonPath }
}

/** Determine if mode should write files by default */
export function shouldWriteFiles(mode: string, forceStdout: boolean): boolean {
  if (forceStdout) return false
  if (mode === 'quick' || mode === 'help') return false
  return true
}
