# Planning Guide

A simple domain authority checker that fetches and displays Ahrefs Domain Rating metrics for any website entered by the user.

**Experience Qualities**:
1. **Immediate** - Results appear instantly after domain submission with no unnecessary waiting
2. **Clean** - Minimalist interface focusing attention on the domain rating metric
3. **Trustworthy** - Professional presentation of SEO metrics with clear data hierarchy

**Complexity Level**: Micro Tool (single-purpose)
  - Single focused task: check domain rating via Ahrefs API and display the result prominently

## Essential Features

### Domain Input & Lookup
- **Functionality**: Text input accepting domain names with intelligent HTML parsing to extract data from Ahrefs
- **Purpose**: Allow users to quickly check any domain's authority metrics
- **Trigger**: User enters domain name and submits via button or Enter key
- **Progression**: Empty state → User types domain → Submit → Fetch Ahrefs page → Use AI to extract metrics from multiple data sources (JS variables, data attributes, modal content, structured data) → Results display with prominent DR score
- **Success criteria**: Successfully fetches page content, intelligently extracts metrics using LLM from various HTML locations, and domain rating number displays prominently

### Domain Rating Display
- **Functionality**: Large, prominent display of the domain rating score (integer only, no decimals) extracted via AI from Ahrefs page
- **Purpose**: Immediately communicate the most important metric
- **Trigger**: Successful extraction of metrics from Ahrefs page using LLM-powered HTML parsing
- **Progression**: Fetch page HTML → Extract data via AI → Remove decimal → Display as hero metric
- **Success criteria**: DR score renders clearly with supporting metrics (backlinks, refdomains) as secondary information

## Edge Case Handling
- **Invalid domain format** - Show helpful error message guiding correct format
- **API failure** - Display error state with retry option
- **Empty input** - Disable submit until valid domain entered
- **Network timeout** - Show loading state with timeout fallback

## Design Direction
The design should feel professional, data-driven, and trustworthy like a premium SEO tool - clean interface with clear visual hierarchy emphasizing the domain rating score as the hero element.

## Color Selection
Complementary (opposite colors) - Using professional blue as primary with orange accent for the domain rating metric to create strong visual focus on the key number.

- **Primary Color**: Deep professional blue (oklch(0.45 0.15 250)) communicating trust and expertise in SEO data
- **Secondary Colors**: Light grays and whites (oklch(0.97 0 0)) for clean backgrounds and subtle separation
- **Accent Color**: Vibrant orange (oklch(0.70 0.18 45)) for the domain rating number, drawing immediate attention to the key metric
- **Foreground/Background Pairings**:
  - Background (White oklch(1 0 0)): Dark text oklch(0.145 0 0) - Ratio 15.3:1 ✓
  - Card (Light Gray oklch(0.98 0 0)): Dark text oklch(0.145 0 0) - Ratio 14.8:1 ✓
  - Primary (Deep Blue oklch(0.45 0.15 250)): White text oklch(1 0 0) - Ratio 7.2:1 ✓
  - Accent (Orange oklch(0.70 0.18 45)): Dark text oklch(0.145 0 0) - Ratio 8.1:1 ✓

## Font Selection
Sans-serif typeface conveying modern professionalism and clarity, optimizing for quick metric comprehension with excellent number legibility.

- **Typographic Hierarchy**:
  - H1 (Domain Rating Number): Inter Bold/72px/tight letter spacing - dominant visual element
  - H2 (Section Headers): Inter Semibold/18px/normal letter spacing
  - Body (Metrics Labels): Inter Regular/14px/normal letter spacing
  - Small (Supporting Info): Inter Regular/12px/normal letter spacing

## Animations
Subtle and purposeful - gentle fade-in for results emphasizing the transition from loading to data display, with no distracting motion that delays user comprehension.

- **Purposeful Meaning**: Smooth fade-in communicates successful data retrieval and builds confidence
- **Hierarchy of Movement**: Domain rating number fades in slightly before supporting metrics, establishing clear visual priority

## Component Selection
- **Components**:
  - Input (text field) - Standard with subtle border, grows on focus
  - Button (primary) - Solid primary color for submit action
  - Card - Elevated card for results display with subtle shadow
  - Badge - For supporting metric labels
  - Skeleton - Loading states for metrics while fetching
  
- **Customizations**:
  - Hero metric display - Custom large number component styled with accent color
  - Metric grid - Custom layout for supporting stats (backlinks, refdomains)

- **States**:
  - Input: default → focus (border color change) → disabled (while loading)
  - Button: default → hover (slightly darker) → active (pressed) → disabled (loading)
  - Results card: hidden → skeleton loading → populated with fade-in

- **Icon Selection**:
  - MagnifyingGlass or Globe for search/lookup button
  - Link or ChartLine for backlinks metrics
  - ArrowsClockwise for retry on error

- **Spacing**:
  - Form container: p-6
  - Between input and button: gap-3
  - Results card: p-8 with mt-6
  - Metric grid: gap-6
  - Hero metric margin: mb-8

- **Mobile**:
  - Single column layout on mobile (<768px)
  - Slightly smaller hero metric (48px instead of 72px)
  - Stack input and button vertically on very small screens
  - Maintain touch-friendly 44px button height
