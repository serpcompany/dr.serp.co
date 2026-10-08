import { describe, expect, it } from 'vitest'

import { normalizeTarget } from './domain-target.mjs'

describe('normalizeTarget', () => {
  it('rejects known junk entries that should never appear in /sites', () => {
    const invalidTargets = [
      'phpinfo.php',
      'wp-login.php',
      'xmlrpc.php',
      'wp-json',
      'contact',
      'demo',
      'pricing',
      'ftp-config.json',
      'get-in-touch',
      'help',
      '.env.production',
      '.env.save',
      '.remote',
      'backup.sql',
      '.env',
      'support',
      '.env.sample',
      'wp',
      '.env.local',
      'wordpress',
      'database.sql'
    ]

    for (const target of invalidTargets) {
      expect(normalizeTarget(target)).toBeNull()
    }
  })

  it('rejects backup and config files probed by vulnerability scanners', () => {
    const scannerTargets = [
      'config.php.save',
      'test.php.save',
      'gcp-key.save',
      'env.save',
      'token.save',
      'credentials.yml.save',
      'settings.py.save',
      'application.properties.save',
      'azure-credentials.properties',
      'celery.config.properties',
      'aws.properties',
      'config.inc',
      'index.php.dev',
      'index.php.prod',
      'index.php.new',
      'app.js.map',
      'getlooma.com.map',
      'env.prod',
      'dockerfile.dev',
      'dockerfile.prod',
      'phpinfo.dev',
      'outputs.tf',
      'sendmail.cf'
    ]

    for (const target of scannerTargets) {
      expect(normalizeTarget(target)).toBeNull()
    }
  })

  it('accepts real domains', () => {
    expect(normalizeTarget('onlyfansvideodownloader.com')).toBe('onlyfansvideodownloader.com')
    expect(normalizeTarget('https://www.example.com/path?q=1')).toBe('example.com')
  })

  it('accepts real domains that resemble file names', () => {
    const realTargets = [
      'php.net',
      'wiki.php.net',
      'json.org',
      'vue.js.org',
      'web.dev',
      'env.dev',
      'docs.new',
      'bushe.co',
      'docs.docker.com'
    ]

    for (const target of realTargets) {
      expect(normalizeTarget(target)).toBe(target)
    }
  })
})
