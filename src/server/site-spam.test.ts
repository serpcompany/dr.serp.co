import { describe, expect, it } from "vitest"

import { isSpamSite } from "./site-spam.mjs"

describe("isSpamSite", () => {
  it("flags gambling, escort, darknet and pharma sites seen in /sites submissions", () => {
    const spam = [
      { domain: "casinosblockchain.io" },
      { domain: "onlinegamblingtops.biz" },
      { domain: "realmoneyslots.in.net" },
      { domain: "escortsisli.com" },
      { domain: "mydarknetlist.info" },
      { domain: "achatcialisgeneriquefrance.net" },
      { domain: "tripscan77.us" },
      { domain: "soicaudb.com" },
      { domain: "stlpca.org", siteTitle: "Best Non GamStop Casinos 2026 - UK Casinos Not on GamStop" },
      { domain: "okwinn.vip", siteTitle: "78WIN Onlinebk ⚽️ Link Đăng Ký Chính Thức Của 78WIN" },
      { domain: "kingbuffetbatonrouge.com", siteTitle: "SLOT88: Link Login Slot Gacor Dengan Vega168" },
      { domain: "gina-rodriguez.org", siteTitle: "OWLTOTO - Akses Utama Terupdate dan Mudah Diakses" },
      { domain: "mtquick.com", siteTitle: "먹튀퀵 - 먹튀검증 전문 커뮤니티" },
      { domain: "promo-bonus199.com", siteTitle: "1хбет промокод 2026 — рабочий бонус-код 1xBet" },
      { domain: "mardinim.com", siteTitle: "Mardin Escort & Midyat Escort | En Yeni İlanlar" },
      { domain: "darkmarketonline.info", siteTitle: "Darknet Market Online – Darknet Market Links" },
    ]

    for (const site of spam) {
      expect(isSpamSite(site), site.domain).toBe(true)
    }
  })

  it("keeps ordinary sites, including our own downloader network", () => {
    const legit = [
      { domain: "bushe.co", siteTitle: "Patrick Bushe | Building Chrome Extensions & Digital Products" },
      { domain: "serp.co", siteTitle: "Find Your Next SaaS - Discover the Best Software" },
      { domain: "pornvideodownloaders.com", siteTitle: "Porn Video Downloaders Directory of Products" },
      { domain: "whoworeitbetter.co.uk", siteTitle: "WHO WORE IT BETTER?" },
      { domain: "alphabet.com", siteTitle: "Alphabet" },
      { domain: "slothbear.com" },
      { domain: "fashion-era.com", siteTitle: "Fashion-Era | A Fashion History Hub" },
      { domain: "earth.org", siteTitle: "Earth.Org – Environmental News" },
    ]

    for (const site of legit) {
      expect(isSpamSite(site), site.domain).toBe(false)
    }
  })
})
