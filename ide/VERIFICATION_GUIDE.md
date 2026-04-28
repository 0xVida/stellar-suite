# Tagging System - Verification & Testing Guide

## 🚀 Quick Start

### Prerequisites
```bash
cd ide
npm install  # or pnpm install
npm run dev  # Start development server
```

### Access the Features
1. **Projects Landing Page**: Navigate to `http://localhost:3000/projects`
2. **Global Search**: Press `Ctrl+Shift+F` → Click "Projects" tab

## ✅ Verification Checklist

### Component: TagManager

**Location**: `src/components/projects/TagManager.tsx`

- [ ] **Tag Creation**
  - Click "Add Tag" button
  - Enter tag name (e.g., "DeFi")
  - Select a color from the 8-color palette
  - Click "Add Tag"
  - **Expected**: Tag appears in the list above the button

- [ ] **Tag Display**
  - Tags show with correct color background
  - Icon appears (tag icon)
  - Tag name is visible
  - **Verify**: All 8 colors display correctly

- [ ] **Tag Removal**
  - Click X button on tag badge
  - **Expected**: Tag is removed from list
  - "Add Tag" button becomes available again

- [ ] **Keyboard Shortcuts**
  - Focus on tag name input, press Enter
  - **Expected**: Tag is added without clicking button
  - Press Escape when dropdown is open
  - **Expected**: Dropdown closes

- [ ] **Constraints**
  - Try adding more than 5 tags
  - **Expected**: Button disables after 5th tag
  - Try entering 21+ character name
  - **Expected**: Input truncates to 20 characters

### Component: ProjectCard

**Location**: `src/components/projects/ProjectCard.tsx`

- [ ] **Card Display**
  - Project name appears in bold
  - Project ID shows (truncated)
  - Network displayed with icon
  - File count shown
  - Last update time visible (human readable)
  - **Expected**: All info clearly visible

- [ ] **Tags Display**
  - Projects with tags show tag section
  - Tags display with correct colors
  - Multiple tags layout properly
  - **Expected**: Visual hierarchy is clear

- [ ] **Edit Button**
  - Hover over card
  - **Expected**: Edit button appears on right
  - Click edit button
  - **Expected**: TagsEditModal opens

- [ ] **Card Interaction**
  - Click on card
  - **Expected**: Project selection or navigation occurs

### Component: ProjectsLanding

**Location**: `src/components/projects/ProjectsLanding.tsx`

#### Desktop View
- [ ] **Layout**
  - Sidebar on left (filter)
  - Main content on right (projects grid)
  - Header with title and "New Project" button
  - Search bar visible
  - **Expected**: Professional layout

- [ ] **Sidebar Filter**
  - "Tags" section visible
  - List of all available tags
  - Click count indicator on right
  - Projects update when tag clicked
  - **Expected**: Smooth filtering

- [ ] **Search**
  - Type in search bar
  - Projects filter by name
  - Type partial ID
  - **Expected**: Matching projects appear

#### Mobile/Tablet View
- [ ] **Responsive**
  - Sidebar hides on small screens
  - Filter icon appears (top right)
  - Click filter icon
  - **Expected**: Bottom sheet opens

- [ ] **Mobile Filter Sheet**
  - Tags listed in sheet
  - Can scroll through tags
  - Click tag to filter
  - Sheet closes/stays open per UX design
  - **Expected**: Mobile experience smooth

### Component: GlobalSearch Enhanced

**Location**: `src/components/sidebar/GlobalSearch.tsx`

- [ ] **Tab Interface**
  - Two tabs visible: "Files" | "Projects"
  - Default to active state
  - Can switch between tabs
  - **Expected**: Clear tab separation

- [ ] **File Search Tab**
  - Works as before
  - Search files by content
  - Case sensitive toggle
  - Regex toggle
  - **Expected**: No regression

- [ ] **Projects Tab**
  - Type project name
  - Results appear below
  - Projects show with tags
  - Click to open project
  - **Expected**: Functional search

- [ ] **Tag Filtering**
  - Click tag in project result
  - **Expected**: Filter projects by that tag

### Integration: Filter + Search

- [ ] **Combined Filtering**
  - Select tag from sidebar
  - Type search query
  - **Expected**: Results filtered by BOTH tag AND search

- [ ] **Clear Filters**
  - Click tag again to deselect
  - **Expected**: Filter removed, projects reappear
  - Search bar still active
  - **Expected**: Other filters remain

## 🎨 Visual Verification

### Color System
Test all 8 tag colors:
- [ ] Blue badge displays correctly
- [ ] Green badge displays correctly  
- [ ] Red badge displays correctly
- [ ] Purple badge displays correctly
- [ ] Yellow badge displays correctly
- [ ] Pink badge displays correctly
- [ ] Indigo badge displays correctly
- [ ] Cyan badge displays correctly

**Expected**: All colors meet WCAG AA contrast requirements

### Responsive Design
Test breakpoints:

**Mobile (375px)**
- [ ] Layout stacks vertically
- [ ] Project cards take full width
- [ ] Filter button visible
- [ ] Text remains readable
- **Expected**: No horizontal scroll

**Tablet (768px)**
- [ ] 2-column grid
- [ ] Sidebar visible (optional)
- [ ] All controls accessible
- **Expected**: Touch-friendly sizes

**Desktop (1920px)**
- [ ] 3-column grid
- [ ] Sidebar fully visible
- [ ] Optimal spacing
- **Expected**: Professional appearance

## ⚡ Performance Tests

### Load Performance
- [ ] Projects load without blocking UI
- [ ] Search debounces at 300ms
- [ ] Filter updates smoothly
- **Expected**: <100ms response time for filtering

### Memory Usage
- [ ] Add/remove many tags
- [ ] Open/close modal repeatedly
- **Expected**: No memory leaks (check DevTools)

## ♿ Accessibility Tests

### Keyboard Navigation
- [ ] Tab through all interactive elements
- [ ] Focus visible on all buttons
- [ ] Can reach all controls via keyboard
- **Expected**: Full keyboard support

### Screen Reader
- [ ] Labels on all form inputs
- [ ] Button purposes clear
- [ ] Table headers proper
- **Expected**: Accessible via screen reader

### Color Contrast
- [ ] Use browser accessibility checker
- [ ] All text meets AA standard (4.5:1)
- [ ] All badges meet AA standard
- **Expected**: Accessibility report passes

## 🔍 Data Integrity Tests

### Tag Persistence
- [ ] Add tag to project
- [ ] Refresh page
- **Note**: Tags persist in store (backend integration needed)

### Filter State
- [ ] Select filter
- [ ] Navigate away
- [ ] Return
- **Expected**: Filter state preserved (if localStorage implemented)

### Search History
- [ ] Search for project
- [ ] Type same search again
- **Expected**: Quick suggestions (if implemented)

## 🐛 Edge Cases

### Empty States
- [ ] No projects exist
  - **Expected**: "No projects found" message
- [ ] No tags exist
  - **Expected**: "No tags yet" in sidebar
- [ ] No search results
  - **Expected**: Clear message

### Error States
- [ ] API fails to load projects
  - **Expected**: Error message displayed
- [ ] Tag creation fails
  - **Expected**: Error toast/notification

### Boundary Cases
- [ ] Add tag with spaces: "  Tag  "
  - **Expected**: Trimmed to "Tag"
- [ ] Add tag with special chars: "@#$%"
  - **Expected**: Either allowed or sanitized
- [ ] Add duplicate tag
  - **Expected**: Handled per design spec

## 📊 State Management Tests

### Store Tests (useProjectsStore)
```typescript
// Test filtering logic
const store = useProjectsStore();

// Add projects
store.setProjects([
  { id: "1", name: "DeFi", tags: [defiTag] },
  { id: "2", name: "NFT", tags: [nftTag] }
]);

// Test tag filter
store.toggleTag(defiTag);
const filtered = store.filteredProjects();
// Expected: Only project 1

// Test search
store.setSearchQuery("DeFi");
const searched = store.filteredProjects();
// Expected: Only project 1
```

### Hook Tests (useProjects)
```typescript
// Test in component
const { filteredProjects, selectedTags, toggleTag } = useProjects();

// Should auto-load projects
// Should allow tag toggling
// Should update filtered results
```

## 🎯 User Workflows

### Workflow 1: Create and Filter
1. Navigate to Projects page
2. See list of all projects
3. Click Edit on a project
4. Add tag "DeFi" (blue color)
5. Save
6. In sidebar, click "DeFi" tag
7. **Expected**: Project now visible, others filtered out

### Workflow 2: Search with Tags
1. Go to Global Search (Ctrl+Shift+F)
2. Click Projects tab
3. Type "DeFi"
4. See results with DeFi-tagged projects
5. Click tag badge in result
6. **Expected**: Filter applied

### Workflow 3: Multi-Tag Filter
1. Go to Projects page
2. Click "DeFi" tag in sidebar
3. Click "NFT" tag in sidebar
4. **Expected**: Projects with BOTH tags appear
   (or logic varies by design)

## 📱 Cross-Browser Testing

Test in:
- [ ] Chrome/Chromium (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

**Expected**: Consistent experience across browsers

## 🚀 Deployment Checklist

Before merging to main:
- [ ] All tests pass
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Components render without errors
- [ ] Mobile responsive verified
- [ ] Accessibility audit passed
- [ ] Performance metrics acceptable
- [ ] Code reviewed
- [ ] Documentation complete

## 📝 Commit Verification

Branch: `feat/project-tagging-system`
Commit: `060a2c3`

Files Changed:
```
 M src/components/sidebar/GlobalSearch.tsx
 M src/lib/cloud/cloudSyncService.ts
 A TAGGING_SYSTEM_DOCUMENTATION.md
 A src/app/projects/page.tsx
 A src/components/projects/ProjectCard.tsx
 A src/components/projects/ProjectsLanding.tsx
 A src/components/projects/TagManager.tsx
 A src/components/projects/TagsEditModal.tsx
 A src/components/sidebar/ProjectSearchPanel.tsx
 A src/hooks/useProjects.ts
 A src/store/useProjectsStore.ts
```

Total: 11 files changed, 1515 insertions(+), 113 deletions(-)

---

**Testing Completed**: [Date/Time]
**Tester**: [Your name]
**Status**: Ready for merge ✅
