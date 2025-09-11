/**********************************************************************************
 * MIT License                                                                    *
 *                                                                                *
 * Copyright (c) 2021 Hyperjump Technology                                        *
 *                                                                                *
 * Permission is hereby granted, free of charge, to any person obtaining a copy   *
 * of this software and associated documentation files (the "Software"), to deal  *
 * in the Software without restriction, including without limitation the rights   *
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell      *
 * copies of the Software, and to permit persons to whom the Software is          *
 * furnished to do so, subject to the following conditions:                       *
 *                                                                                *
 * The above copyright notice and this permission notice shall be included in all *
 * copies or substantial portions of the Software.                                *
 *                                                                                *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR     *
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,       *
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE    *
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER         *
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,  *
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE  *
 * SOFTWARE.                                                                      *
 **********************************************************************************/

import { existsSync } from 'node:fs'
import { rename, writeFile } from 'node:fs/promises'
import { expect } from 'chai'
import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

import { resetContext, setContext } from '../../context/index.js'
import { sanitizeFlags } from '../../flag.js'
import type { Config } from '../../interfaces/config.js'
import type { Probe } from '../../interfaces/probe.js'
import { getProbes } from './probe.js'
import { watchConfigChanges } from './watcher.js'

describe('Config watcher', () => {
  const config: Config = {
    probes: [
      {
        id: '1',
        requests: [{ url: 'https://example.com' }],
      } as Probe,
    ],
  }
  const server = setupServer(
    http.get(
      'https://example.com/monika.json',
      () => new HttpResponse(JSON.stringify(config))
    )
  )

  before(() => {
    server.listen()
  })

  afterEach(() => {
    server.resetHandlers()
    resetContext()
  })

  after(() => {
    server.close()
  })

  it('should polling config from a URL', async () => {
    // arrange
    const configIntervalSeconds = 1
    setContext({
      flags: sanitizeFlags({
        config: ['https://example.com/monika.json'],
        'config-interval': configIntervalSeconds,
      }),
    })

    // act
    const watchers = watchConfigChanges()
    const seconds = 1000
    await sleep(configIntervalSeconds * seconds)

    // assert
    expect(getProbes()[0].requests?.[0].url).eq(
      config.probes[0].requests?.[0].url
    )

    for (const { cancel } of watchers) {
      cancel()
    }
  })

  it('should watch config file changes', async () => {
    // arrange
    if (existsSync('monika.json')) {
      await rename('monika.json', 'monika_backup.json')
    }

    await writeFile('monika.json', JSON.stringify(config), { encoding: 'utf8' })

    setContext({
      flags: sanitizeFlags({
        config: ['monika.json'],
      }),
    })

    // act
    const watchers = watchConfigChanges()
    const newConfig = {
      probes: [
        {
          id: '2',
          requests: [
            {
              url: 'https://example.com/changed',
            },
          ],
        },
      ],
    }
    await writeFile('monika.json', JSON.stringify(newConfig), {
      encoding: 'utf8',
    })
    await sleep(1000)

    // assert
    // expect(getProbes()[0].id).eq('2')
    // expect(getProbes()[0].requests?.[0].url).eq('https://example.com/changed')
    for (const { cancel } of watchers) {
      cancel()
    }

    if (existsSync('monika_backup.json')) {
      await rename('monika_backup.json', 'monika.json')
    }
  })
})

function sleep(durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, durationMs)
  })
}
