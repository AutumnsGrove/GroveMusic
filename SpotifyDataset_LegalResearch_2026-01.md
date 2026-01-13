# Spotify Dataset Legal Landscape Research
**Research Date:** January 13, 2026
**Status:** Active legal developments ongoing
**Confidence Level:** HIGH (based on multiple authoritative sources)

---

## Executive Summary

The Anna's Archive Spotify scrape (December 2025) has triggered significant legal action. Anna's Archive lost its primary .org domain in early January 2026, likely due to court order. While the archive remains accessible via alternative domains, the legal risks of using this dataset are substantial and increasing. **NO clean, legal alternative exists at comparable scale.**

**Key Findings:**
- ✅ Dataset exists and is distributed via torrents (86M audio files + 256M track metadata)
- ⚠️ Anna's Archive under severe legal pressure (domain suspension, lawsuits)
- ❌ Spotify has NOT filed lawsuit yet, but has taken technical countermeasures
- ❌ No legal alternative dataset at comparable scale (~35M max vs 256M)
- ⚠️ Using this data carries significant copyright and ToS violation risks

---

## 1. What Happened to the Archive?

### Domain Suspension (January 2026)

**STATUS: Main domain suspended, archive still accessible**

Anna's Archive lost its primary `.org` domain in early January 2026 when the Public Interest Registry (PIR) placed it on `serverHold` status, effectively suspending it globally.

**Significance:** PIR historically refused to voluntarily suspend domains (including thepiratebay.org), which strongly suggests this action was backed by a court order.

**Current Access:** The archive remains operational through alternative domains:
- annas-archive.li
- annas-archive.se
- annas-archive.in
- annas-archive.pm

**Source:** [TorrentFreak - Anna's Archive Loses .Org Domain After Surprise Suspension](https://torrentfreak.com/annas-archive-loses-org-domain-after-surprise-suspension/)

### DMCA Takedown Scale

By November 2025 (before the Spotify scrape), Google had already removed **749 million Anna's Archive URLs** from search results — representing 5% of ALL takedown requests sent to Google since 2012.

**Source:** [TorrentFreak - Google Removed 749 Million Anna's Archive URLs](https://torrentfreak.com/google-removed-749-million-annas-archive-urls-from-its-search-results/)

---

## 2. The Spotify Scrape: What Actually Happened

### Timeline

- **December 20, 2025:** Anna's Archive announces comprehensive Spotify backup
- **December 22, 2025:** Spotify confirms unauthorized access and disables accounts
- **January 2026:** Distribution via torrents begins (metadata first, audio by popularity)

### Scale of the Dataset

| Component | Size | Coverage |
|-----------|------|----------|
| **Track metadata** | ~50GB compressed | 256 million tracks |
| **Audio files** | ~300TB total | 86 million songs (99.6% of streams) |
| **Audio features** | ~4TB compressed | Tempo, energy, danceability, etc. |
| **Playlist data** | ~100GB | Millions of playlists |
| **Time coverage** | 2007 - July 2025 | Everything pre-July 2025 |

**Sources:**
- [The Register - Anna's Archive claims Spotify scrape to 'preserve culture'](https://www.theregister.com/2025/12/22/hacktivists_scrape_songs_spotify/)
- [Android Authority - Someone just archived all of Spotify](https://www.androidauthority.com/spotify-annas-archive-3627023/)

### Spotify's Response

**Technical Countermeasures:**
- Identified and disabled accounts used for scraping
- Implemented "new safeguards for these types of anti-copyright attacks"
- Characterized the action as "piracy" and "unlawful scraping"

**Legal Action:**
- ❌ **NO lawsuit filed yet** (as of January 13, 2026)
- Spotify "stands with the artist community against piracy"

**Sources:**
- [The Record - Spotify disables accounts after open-source group scrapes 86 million songs](https://therecord.media/spotify-disables-scraping-annas)
- [Billboard - Spotify Music Library Scraped by Pirate Activist Group](https://www.billboard.com/business/streaming/spotify-music-library-leak-1236143970/)

---

## 3. Legal Developments & Landscape

### Active Legal Proceedings Against Anna's Archive

| Proceeding | Status | Details |
|------------|--------|---------|
| **OCLC Lawsuit** | Active (filed Jan 2024) | Over $5M in damages sought for WorldCat scraping; injunction requested against domain registries |
| **Domain Suspension** | Executed (Jan 2026) | .org domain placed on serverHold, likely court-ordered |
| **Notorious Markets List** | Listed since 2023 | Appears on US Trade Representative's annual list |
| **Telegram Ban** | Executed (Jan 2025) | Anna's Archive channel suspended for copyright infringement |

**Source:** [Legal News Feed - Anna's Archive Domain Suspension](https://legalnewsfeed.com/2026/01/05/annas-archive-domain-suspension-highlights-ongoing-tensions-in-digital-content-distribution/)

### Spotify API Legal Framework (2024-2026)

#### Recent Restrictions (November 2024)

Spotify **restricted access to Audio Features and Audio Analysis endpoints** for new third-party applications on November 27, 2024. These endpoints provided:
- Tempo (BPM)
- Key signature
- Danceability, energy, valence
- Detailed structural analysis

**Impact:** Developers can no longer legally obtain this data for new apps, making scraped datasets even more attractive (and more legally problematic).

**Source:** [Voclr.it - Why Spotify Has Restricted Its API Access](https://voclr.it/news/why-spotify-has-restricted-its-api-access-what-changed-and-why-it-matters-in-2026/)

#### Current Developer Policy

Spotify's Developer Terms explicitly prohibit:

✅ **Allowed:**
- Using metadata with link back to Spotify
- Streaming via Spotify SDK
- Research with proper attribution

❌ **Prohibited:**
- Offering metadata as standalone service
- Training ML/AI models on Spotify data
- Redistributing audio or metadata
- Downloading or storing audio files

**Source:** [Spotify Developer Policy](https://developer.spotify.com/policy)

### Copyright & Terms of Service Analysis

**Legal Issues with the Scraped Dataset:**

1. **Copyright Infringement:** Audio files are clearly copyrighted works
2. **ToS Violation:** Scraping violates Spotify's Terms of Service
3. **GDPR Concerns:** Playlist data may contain user information
4. **DRM Circumvention:** Audio extraction circumvented Spotify's DRM (potentially DMCA 1201 violation in US)
5. **Metadata Copyright:** Metadata compilation may have database rights protection

**Sources:**
- [Music Ally - Spotify says 'anti-copyright extremists' scraped its library](https://musically.com/2025/12/22/spotify-says-anti-copyright-extremists-scraped-its-library/)
- [MusicTech Solutions - Why Spotify is a Crime Scene](https://musictech.solutions/2025/12/22/annas-archive-spotify-and-the-shadow-library-playbook-why-spotify-is-a-crime-scene/)

---

## 4. Clean, Legal Alternatives

### Reality Check

**NO dataset exists at Spotify's scale with legal licensing.** The largest legal alternatives are ~15% of Spotify's size.

### Available Legal Datasets

#### 1. MusicBrainz (RECOMMENDED - Best Legal Option)

| Aspect | Details |
|--------|---------|
| **License** | Public Domain (CC0 1.0 Universal) |
| **Scale** | 35.2M recordings, 4.7M releases, 2.6M artists (as of May 2025) |
| **Coverage** | Comprehensive metadata via community contribution |
| **Audio Features** | ❌ No audio features included |
| **Audio Files** | ❌ Metadata only |
| **ISRCs** | ✅ Available for cross-referencing |
| **API** | ✅ Free, unlimited for non-commercial |

**Why MusicBrainz Works:**
- Already in your spec (spotify-metadata-spec.md mentions ISRC cross-reference)
- Legally unambiguous
- Active community maintenance
- Free for commercial use

**Sources:**
- [MusicBrainz](https://musicbrainz.org/)
- [Wikipedia - MusicBrainz](https://en.wikipedia.org/wiki/MusicBrainz)

#### 2. Free Music Archive (FMA) Dataset

| Aspect | Details |
|--------|---------|
| **License** | Creative Commons (CC BY 4.0) |
| **Scale** | 106,574 tracks from 16,341 artists |
| **Audio** | ✅ Full-length, high-quality (917 GiB) |
| **Features** | ✅ Pre-computed audio features |
| **Metadata** | Track, artist, album, genre, tags, play counts |
| **Genres** | 161 genres in hierarchical taxonomy |

**Limitations:** Much smaller than Spotify; niche/independent artists

**Sources:**
- [GitHub - FMA Dataset](https://github.com/mdeff/fma)
- [arXiv - FMA: A Dataset For Music Analysis](https://arxiv.org/abs/1612.01840)

#### 3. MTG-Jamendo Dataset

| Aspect | Details |
|--------|---------|
| **License** | Creative Commons |
| **Scale** | 55,000 full tracks |
| **Audio** | ✅ 320kbps MP3, full tracks |
| **Tags** | 195 tags (genre, instrument, mood/theme) |
| **Quality** | Properly defined splits for ML training |

**Use Case:** Great for training genre/mood classifiers

**Sources:**
- [MTG-Jamendo Dataset](https://mtg.github.io/mtg-jamendo-dataset/)
- [GitHub - MTG Jamendo Dataset](https://github.com/MTG/mtg-jamendo-dataset)

#### 4. Million Song Dataset (MSD)

| Aspect | Details |
|--------|---------|
| **License** | Free for research |
| **Scale** | 1 million tracks |
| **Audio Features** | ✅ Pre-computed features |
| **Audio Files** | ⚠️ **30-second previews API is BROKEN** |
| **Status** | Legacy dataset (2011), no longer actively maintained |

**Problem:** Audio previews from 7digital no longer work, making this less useful

**Sources:**
- [Million Song Dataset](http://millionsongdataset.com/)
- [Music Classification Tutorial - Datasets](https://music-classification.github.io/tutorial/part2_basics/dataset.html)

#### 5. AcousticBrainz Genre Dataset

| Aspect | Details |
|--------|---------|
| **License** | Open license |
| **Scale** | Large-scale multi-label genre annotations |
| **Features** | Genre/subgenre from multiple metadata sources |
| **Integration** | Can be linked with MusicBrainz IDs |

**Source:** [AcousticBrainz Genre Dataset](https://mtg.github.io/acousticbrainz-genre-dataset/)

#### 6. PDMX (Public Domain MusicXML)

| Aspect | Details |
|--------|---------|
| **License** | Public Domain |
| **Scale** | 250K+ MusicXML files |
| **Source** | MuseScore |
| **Metadata** | Genre, tags, description, popularity |

**Use Case:** Symbolic music analysis, not audio similarity

**Source:** [arXiv - PDMX Dataset](https://arxiv.org/html/2409.10831v1)

---

## 5. Risk Assessment for Using Spotify Scraped Data

### Legal Risks

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Copyright infringement lawsuit** | High (millions in damages) | Medium | Don't use audio files; metadata-only reduces risk |
| **DMCA 1201 violation** | High (criminal liability possible) | Low (if metadata-only) | Avoid audio files entirely |
| **ToS violation / tortious interference** | Medium | High | Use data internally only, no redistribution |
| **GDPR violation** | High (4% global revenue) | Medium (if playlist data contains PII) | Anonymize/exclude playlist data |
| **Reputational damage** | Medium | High | Association with "piracy" affects fundraising/partnerships |

### Technical Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| **Data staleness** | High (no updates after July 2025) | Hybrid approach: MusicBrainz for new releases |
| **Data integrity** | Medium | Verify checksums, sample validation |
| **Availability** | Medium (torrents may become unavailable) | Mirror data locally; have backup plan |

### Business Risks

| Risk | Impact | Notes |
|------|--------|-------|
| **Investor due diligence** | High | VCs may reject based on legal exposure |
| **Partnership limitations** | High | Legitimate music industry players won't work with you |
| **Platform bans** | Medium | Cloudflare/AWS may terminate service if discovered |
| **Insurance** | Medium | E&O insurance may not cover willful infringement |

---

## 6. Hybrid Approach Recommendations

Given the lack of clean alternatives at scale, a **hybrid approach** may be optimal:

### Recommended Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    HYBRID DATA STRATEGY                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  PRIMARY (100% legal):                                       │
│  ├─ MusicBrainz: Metadata + ISRCs                          │
│  ├─ Last.fm API: Similar tracks, tags, play counts         │
│  ├─ AcousticBrainz: Audio features (where available)       │
│  └─ Spotify API: For tracks with explicit user request     │
│                                                              │
│  SUPPLEMENTARY (use with caution):                          │
│  ├─ FMA/Jamendo: Train audio feature models                │
│  ├─ Million Song: Historical benchmark comparisons         │
│  └─ Academic datasets: Research validation                 │
│                                                              │
│  AVOID:                                                      │
│  ├─ Anna's Archive Spotify audio files                     │
│  ├─ Spotify metadata as primary source                     │
│  └─ Playlist co-occurrence from scraped data               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Why This Works

1. **Legal defensibility:** All primary sources have proper licensing
2. **Scale:** MusicBrainz (35M recordings) covers most popular music
3. **Freshness:** APIs provide up-to-date data
4. **Features:** Can train models on legal datasets (FMA) and apply to MusicBrainz catalog
5. **User context:** When user requests a playlist, you can hit Spotify API for those specific tracks

### What You Lose vs. Scraped Data

- ❌ Pre-computed audio features for all 256M tracks
- ❌ Playlist co-occurrence graph (1.7B relationships)
- ❌ Popularity scores for obscure tracks
- ❌ Complete discography for every artist

### What You Gain

- ✅ No legal risk
- ✅ No ethical ambiguity
- ✅ Partnership opportunities with music industry
- ✅ Investor/VC confidence
- ✅ Platform stability (no ToS violations)

---

## 7. Alternative Approaches to Audio Features

Since Spotify restricted the Audio Features API, here are legal alternatives:

### Option A: Train Your Own Models

Use **FMA Dataset** (106K tracks with CC licenses) to train audio feature extraction models:

1. Extract features from FMA tracks using open-source tools:
   - [librosa](https://librosa.org/) (Python) - audio analysis
   - [Essentia](https://essentia.upf.edu/) (C++/Python) - MIR features
   - [Marsyas](https://marsyas.info/) - feature extraction

2. Train models to predict tempo, key, energy, danceability, etc.

3. Apply models to preview clips from legal sources (MusicBrainz + 7digital/iTunes previews)

**Legality:** ✅ Fully legal (training on CC-licensed data, applying to legally obtained previews)

### Option B: Use Existing Audio Analysis APIs

| Service | Legality | Coverage | Cost |
|---------|----------|----------|------|
| **AcousticBrainz** | ✅ Legal (public DB) | Limited | Free |
| **Spotify API** | ✅ Legal (with user auth) | Full Spotify catalog | Free (with restrictions) |
| **Last.fm API** | ✅ Legal | Metadata only, no audio features | Free |
| **Discogs API** | ✅ Legal | Metadata only | Free (rate-limited) |

### Option C: Collaborative Filtering Without Audio Features

Focus on **tag-based** and **collaborative filtering** similarity instead of audio features:

- Last.fm similar tracks API
- Last.fm tags (tempo, mood, genre)
- MusicBrainz genres and relationships
- User listening patterns (if you have users)

**Trade-off:** Less accurate than audio features, but still effective

---

## 8. Specific Recommendations for GroveMusic/Aria

Based on your `spotify-metadata-spec.md` and `TODOS.md`:

### What to Do Now

1. **✅ PROCEED** with MusicBrainz + Last.fm integration (already in your stack)
2. **✅ PROCEED** with training audio feature models on FMA dataset
3. **⚠️ RECONSIDER** downloading the Anna's Archive Spotify torrent
4. **✅ PROCEED** with Cloudflare infrastructure (R2, D1, Vectorize) as designed

### Modified Implementation Path

Your current spec assumes access to Spotify scraped data. Here's how to adapt:

#### Phase S0: Research & Acquisition (MODIFIED)

- [x] ~~Download metadata torrents from Anna's Archive~~ **→ Skip this**
- [ ] Download **FMA Dataset** instead (106K tracks, legal)
- [ ] Download **MusicBrainz database dump** (monthly updates, legal)
- [ ] Set up audio feature extraction pipeline using librosa/Essentia

#### Phase S1: Storage Setup (NO CHANGES NEEDED)

- [x] R2 bucket for partitioned databases
- [x] D1 tables for hot data
- [x] SpotifyMetadataService with 4-layer caching
- [ ] Vectorize index (but populate with FMA-trained features instead)

**Key insight:** Your infrastructure design is sound; just change the data source.

#### Phase S2: Cross-Reference Building (MODIFIED)

- [ ] Use **MusicBrainz ISRC → MBID** mapping (already public domain)
- [ ] Build **Last.fm track → MusicBrainz** cross-reference
- [ ] Build **FMA track → MusicBrainz** cross-reference (for feature validation)

#### Phase S3: Audio Feature Integration (MODIFIED)

- [ ] Train feature extraction models on **FMA dataset** (legal)
- [ ] Extract features from **30-second previews** (iTunes/7digital, where available)
- [ ] For tracks without previews, use **tag-based similarity** (Last.fm)
- [ ] Generate vectors for MusicBrainz popular tracks (based on Last.fm play counts)

#### Phase S4: Playlist Mining (ALTERNATIVE APPROACH)

Instead of Spotify playlist co-occurrence (requires scraped data), use:

- **Last.fm user libraries:** "Users who listen to X also listen to Y"
- **Last.fm similar tracks API:** Pre-computed collaborative filtering
- **MusicBrainz relationships:** Artist collaborations, same label, etc.

**Trade-off:** Less data than 1.7B Spotify playlist relationships, but still effective and legal.

#### Phase S5-S6: No changes needed

Pipeline integration and optimization proceed as designed.

### Updated Cost Estimate

| Resource | Original Spec (Spotify scraped) | Modified Spec (Legal sources) |
|----------|--------------------------------|------------------------------|
| **R2 Storage** | $5/month (200GB Spotify data) | $1/month (50GB MusicBrainz) |
| **Vectorize** | $0.75/month (15M vectors) | $0.50/month (10M vectors) |
| **D1 Database** | $0/month (free tier) | $0/month (free tier) |
| **API costs** | $0 (self-hosted) | $0 (Last.fm free tier) |
| **Total** | ~$6/month | ~$2/month |

**Bonus:** Lower costs AND no legal risk.

---

## 9. Legal Opinion Recommendations

Before proceeding with ANY use of the Spotify scraped data, consult with an IP attorney about:

1. **Metadata-only usage:** Can you use ONLY metadata (no audio) for internal similarity matching?
2. **Research exemption:** Does your use case qualify for fair use or research exemptions?
3. **Jurisdiction:** How do copyright laws differ in your operating jurisdiction?
4. **Liability limitation:** Corporate structure to limit personal liability
5. **Insurance:** E&O insurance coverage for IP claims

**Cost:** $300-500/hour, but could save millions in litigation.

---

## 10. Monitoring & Updates

This is a rapidly evolving situation. Monitor these sources for updates:

### Legal Developments
- [TorrentFreak](https://torrentfreak.com/) - Copyright litigation news
- [The Record](https://therecord.media/) - Cybersecurity and legal news
- [US Copyright Office](https://www.copyright.gov/) - DMCA exemptions and rulings

### Anna's Archive Status
- Check domain availability: annas-archive.org, .li, .se, .in, .pm
- Monitor torrent availability on public trackers

### Spotify Policy Changes
- [Spotify Developer Blog](https://developer.spotify.com/blog) - API changes
- [Spotify Terms of Service](https://www.spotify.com/legal/) - Policy updates

### Set Up Alerts
- Google Alerts: "Anna's Archive lawsuit"
- Google Alerts: "Spotify metadata scraping legal"
- RSS feeds from TorrentFreak, The Record

---

## Sources & References

### Primary Sources - Legal Developments

1. [TorrentFreak - Anna's Archive Loses .Org Domain After Surprise Suspension](https://torrentfreak.com/annas-archive-loses-org-domain-after-surprise-suspension/)
2. [Legal News Feed - Anna's Archive Domain Suspension Highlights Ongoing Tensions](https://legalnewsfeed.com/2026/01/05/annas-archive-domain-suspension-highlights-ongoing-tensions-in-digital-content-distribution/)
3. [TorrentFreak - Google Removed 749 Million Anna's Archive URLs](https://torrentfreak.com/google-removed-749-million-annas-archive-urls-from-its-search-results/)
4. [Spotify Developer Policy](https://developer.spotify.com/policy)
5. [Voclr.it - Why Spotify Has Restricted Its API Access (2026)](https://voclr.it/news/why-spotify-has-restricted-its-api-access-what-changed-and-why-it-matters-in-2026/)

### Primary Sources - Spotify Scrape

6. [The Register - Anna's Archive claims Spotify scrape to 'preserve culture'](https://www.theregister.com/2025/12/22/hacktivists_scrape_songs_spotify/)
7. [Android Authority - Someone just archived all of Spotify](https://www.androidauthority.com/spotify-annas-archive-3627023/)
8. [The Record - Spotify disables accounts after scraping](https://therecord.media/spotify-disables-scraping-annas)
9. [Billboard - Spotify Music Library Scraped by Pirate Activist Group](https://www.billboard.com/business/streaming/spotify-music-library-leak-1236143970/)
10. [Music Ally - Spotify says 'anti-copyright extremists' scraped library](https://musically.com/2025/12/22/spotify-says-anti-copyright-extremists-scraped-its-library/)
11. [MusicTech Solutions - Why Spotify is a Crime Scene](https://musictech.solutions/2025/12/22/annas-archive-spotify-and-the-shadow-library-playbook-why-spotify-is-a-crime-scene/)

### Primary Sources - Legal Alternatives

12. [MusicBrainz](https://musicbrainz.org/)
13. [Wikipedia - MusicBrainz](https://en.wikipedia.org/wiki/MusicBrainz)
14. [GitHub - FMA: A Dataset For Music Analysis](https://github.com/mdeff/fma)
15. [arXiv - FMA: A Dataset For Music Analysis](https://arxiv.org/abs/1612.01840)
16. [MTG-Jamendo Dataset](https://mtg.github.io/mtg-jamendo-dataset/)
17. [GitHub - MTG Jamendo Dataset](https://github.com/MTG/mtg-jamendo-dataset)
18. [Million Song Dataset](http://millionsongdataset.com/)
19. [AcousticBrainz Genre Dataset](https://mtg.github.io/acousticbrainz-genre-dataset/)
20. [arXiv - PDMX: A Large-Scale Public Domain MusicXML Dataset](https://arxiv.org/html/2409.10831v1)

---

## Research Completion Checklist

- [x] All research questions answered
- [x] Confidence levels assigned (HIGH)
- [x] Sources documented (20+ authoritative sources)
- [x] Risks identified (legal, technical, business)
- [x] Best practices documented (hybrid approach)
- [x] Implementation recommendations provided (modified spec)
- [x] Knowledge gaps acknowledged (ongoing legal proceedings)

---

**Bottom Line:** The legal landscape has gotten significantly worse in the past month. Anna's Archive is under active legal attack, and using the Spotify scraped data carries substantial legal risk. Legal alternatives exist but don't match Spotify's scale. A hybrid approach using MusicBrainz + Last.fm + legal training data (FMA) is recommended.

**Next Steps:**
1. Decide if you want to proceed with legal-only approach
2. If yes, modify spotify-metadata-spec.md accordingly
3. If considering scraped data, consult IP attorney first
4. Update TODOS.md based on decision
