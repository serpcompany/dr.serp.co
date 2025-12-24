# FrogDR Clone (Scaffolding Nuxters app) - Project Planning

## Project Overview
This project aims to create a clone of the functionality from [FrogDR](https://frogdr.com/) where a user can generate a "DR" badge showing their websites Domain Rating from ahrefs.

Users authenticate with Google, create a username & submit their domain to check their DR, visualize the data, and generate embeddable badges to display on their sites.

It should be built from cloning the Nuxtr repository as it contains almost all of the UI and functionality and flow that we need -- And simply changing the various endpoints or information to the stuff we need instead of the nuxt or information.

## Core Features

### Authentication
- Google OAuth sign-in using @nuxtjs/auth-next
- User session management with JWT tokens
- Secure authentication flow
- Username selection during onboarding

### Domain Management
- Input form for adding domains to track - free as long as the badge on their website is live with our api link in it. if we lose that communication their account is fronzen unless they pay or fix it
- Dashboard displaying all tracked domains (on their @username page)
- Automated DR updates 1x week for free plan (stretch goal)

### Metrics Display
- An .svg badge that displays their DR, their domain

### Badge Generation
- Customizable embeddable badges showing DR score and a custom message
- A simple design picker so they can select from 1-3 premade design tempaltes
- Copy-to-clipboard functionality for embedding code
- Badge served via API endpoint

### Public Features
- Badge embeds for websites
- Public profile pages at `/@username`
- Domain metrics display on public profiles

## Technical Stack

### Frontend
- **Framework**: Nuxt 3 with TypeScript
- **UI Library**: Nuxt UI (50+ accessible, Tailwind-styled components)
- **UI Pro**: Nuxt UI Pro for pre-built sections & design kits
- **SVG Handling**: nuxt-svgo or nuxt-icons for badge generation

### Backend
- **Authentication**: @nuxtjs/auth-next with Google provider
- **Cloud Integration**: Nuxt Hub (@nuxthub/core) for Cloudflare Pages & Workers
- **API Proxy**: Server routes to RapidAPI for Domain Rating data
- **API Integration**: Direct API calls without persistent storage
- Database handlded through nuxt/hub -> cloudflare d1 sql light database, and image storage with r2

### Deployment
- **Platform**: Nuxt Hub → Cloudflare Pages
- **Edge Deployment**: Global CDN via Cloudflare
- **CI/CD**: Integrated with Nuxt Hub's zero-config deployment

## Architecture

1. **Authentication Flow**:
   - Client invokes Nuxt Auth's Google flow
   - JWT issued on successful callback
   - Token stored for subsequent authenticated requests


1. **Domain Management**:
   - Auth-guarded /dashboard.vue fetches user's domains from Cloudflare KV
   - DomainInput.vue component handles adding new domains
   - Server-side validation of domain format

2. **DR Retrieval**:
   - Server route `/api/rapid-dr` proxies requests to RapidAPI
   - Rate limiting and error handling implemented

3. **Badge Generation**:
   - BadgeCustomizer.vue component for styling options
   - Live preview of badge appearance
   - `/api/badge` endpoint generates SVG/image based on parameters
   - Two types of embed code provided:
     - Simple `<img>` tag with SVG link
     - Dynamic `<object>` tag with SVG link and fallback image

## Data Structure

### Domain Model
```
domains:
  domain: string
  lastDR: number
```

### User Model
```
users:
  id: string
  email: string
  username: string
  domains: Array<string>
```

## Key Components

### Frontend Components
- `composables/useAuth.ts`: Wrapper for Nuxt Auth Google provider
- `DomainInput.vue`: Form with validation for adding domains and username
- `DomainList.vue`: Display of tracked domains with current DR
- `DomainDetail.vue`: Detailed view with domain metrics
- `BadgeCustomizer.vue`: Style selector with live preview
- `ProfilePage.vue`: Public profile view component

### Backend Routes
- `server/api/rapid-dr.ts`: Proxy to RapidAPI with rate-limit handling
- `server/api/badge.ts`: Dynamic badge generation endpoint
- `server/api/domains.ts`: CRUD operations for domain management
- `pages/[...slug].vue`: Dynamic routes for user profile pages

## Development Approach
1. Set up Nuxt 3 project with TypeScript and Nuxt UI
2. Implement Google authentication with @nuxtjs/auth-next
3. Create basic "logged in" dashboard layout and domain input form
5. Implement RapidAPI integration for DR fetching
6. Develop badge customization and generation
7. Set up Nuxt Hub deployment to Cloudflare

## Deployment Strategy
- Utilize Nuxt Hub's zero-config deployment to Cloudflare Pages
- Edge functions for API routes via Cloudflare Workers
- Global distribution through Cloudflare's CDN

## Potential Challenges
- RapidAPI rate limits and potential downtime
- Google OAuth configuration and security
- SVG generation for badges with customization options
- Edge deployment configuration and debugging

## Additional Nuxt Modules

### Authentication Extensions
- `nuxt-auth-utils`: Minimalist SSR auth helpers for custom flows

### SVG & Icon Options
- `nuxt-svgo`: Optimize and import SVGs as Vue components
- `nuxt-icons`: Simplified icon management
- `@nuxtjs/svg-sprite`: Bundle badges into an SVG sprite

### API & Data Handling
- `@vue-api/nuxt`: Unified API client for RapidAPI integration

### Monitoring & Analytics
- `nuxt-cloudflare-analytics`: Built-in Web Analytics

### Testing & Development
- `@nuxt/test-utils`: Unit & integration test helpers

## Future Enhancements
- Detailed backlink analysis
- Competitor comparison features
- Mobile app version
- More advanced badge customization options
- Historical DR data tracking
- Email/push notifications for DR changes