# PRD: Art Placement Spec Review Prototype

## 1. Product Summary

This prototype is a SaaS-style review interface for interior designers to present a completed art placement specification for a client’s home.

The prototype does **not** support creating, editing, uploading, selecting, or placing art. It only shows a finished specification with realistic mock data, allowing users to review:

* Selected art pieces
* Their assigned rooms and walls
* Wall usability constraints
* Art sizing and placement
* Pricing and artist metadata
* A visual wall elevation showing art placement

The goal is to demonstrate the interface, data model, and navigation flow for reviewing a completed art spec.

---

## 2. Target Users

### Primary User

Interior designers reviewing and presenting art placement decisions for a residential client.

### Secondary User

Clients, design assistants, procurement coordinators, or installers reviewing where each piece should go.

---

## 3. Prototype Goals

The prototype should demonstrate:

1. A polished SaaS-style dashboard interface.
2. A complete mocked art specification for a fictional home.
3. Navigation between:

   * Art piece list
   * Room list
   * Wall detail screen
4. Visual rendering of wall lengths, unusable zones, usable zones, and placed art pieces.
5. Enough realism to communicate how this could become a production tool.

---

## 4. Non-Goals

This prototype will **not** include:

* Adding new art pieces
* Uploading images
* Editing placements
* Dragging art on walls
* Client approvals
* User accounts
* Saving data
* Real backend/API
* Real procurement workflow
* Floor plan editing
* Measurement validation
* Installer task management

All data will be hardcoded mock data.

---

## 5. Core Screens

## 5.1 Art Pieces List

### Purpose

Show every selected art piece in the home spec.

### Content

Each art piece row/card should show:

* Artwork thumbnail
* Artwork title
* Artist name
* Room name
* Wall name
* Artwork dimensions
* Placement offset from start of wall
* Price
* Medium/category
* Status, such as:

  * Selected
  * Purchased
  * Pending client approval
  * To be framed

### Interaction

Clicking an art piece should navigate to the relevant wall detail screen, ideally highlighting that piece.

### Example Fields

```txt
Title: Blue Fragment Study
Artist: Mara Ellison
Room: Living Room
Wall: North Wall
Size: 36" W × 48" H
Placement: 42" from wall start
Price: $3,200
Medium: Acrylic on canvas
Status: Selected
```

---

## 5.2 Room List

### Purpose

Show the home organized by rooms and hallways.

### Content

Each room should display:

* Room name
* Room type
* Number of walls
* Number of placed art pieces
* Total art budget for that room
* List of walls

Each wall should display:

* Wall name
* Total wall length
* Usable space summary
* Number of art pieces placed
* Link to wall detail screen

### Example Room

```txt
Living Room
4 walls
3 art pieces
Total art budget: $8,900

Walls:
- North Wall — 144" total, 84" usable, 2 pieces
- East Wall — 120" total, 60" usable, 1 piece
- South Wall — 144" total, no art placed
- West Wall — 120" total, no art placed
```

---

## 5.3 Wall Detail Screen

### Purpose

Show a visual elevation of a single wall, including usable and unusable sections, with selected artworks rendered in position.

### Content

The wall detail screen should include:

* Room name
* Wall name
* Total wall length
* Wall height
* Usable/unusable section breakdown
* Visual wall rendering
* Art pieces placed on that wall
* Detail panel for each art piece

### Wall Visualization

The visualization should render the wall horizontally.

Unusable areas should be shown in gray.

Usable areas should be shown in a lighter neutral background.

Art pieces should be positioned according to their horizontal offset from the start of the wall.

Each art piece should show:

* Thumbnail or simplified artwork image
* Scaled width
* Optional label
* Placement measurement
* Centerline or offset indicator

### Example Wall Specification

```txt
Living Room — North Wall

Total length: 144"
Height: 108"

Segments:
- 0"–12": unusable
- 12"–48": usable
- 48"–72": unusable
- 72"–120": usable
- 120"–144": unusable

Placed Art:
- Blue Fragment Study — starts at 42", 36" W × 48" H
- Ochre Window — starts at 78", 24" W × 30" H
```

---

## 6. Navigation Model

The prototype should have a simple navigation structure:

```txt
Art Pieces List
  → Wall Detail

Room List
  → Room Detail / expanded room section
    → Wall Detail

Wall Detail
  → Back to Art Pieces
  → Back to Rooms
```

A persistent top-level navigation should include:

* Art Pieces
* Rooms
* Project Summary

The Project Summary screen is optional, but useful for polish.

---

## 7. Optional Project Summary Screen

### Purpose

Provide a dashboard overview of the completed spec.

### Content

* Project name
* Client name
* Property name
* Total number of rooms
* Total number of walls
* Total art pieces
* Total estimated art budget
* Pieces pending approval
* Pieces requiring framing
* Rooms with incomplete art coverage

### Example

```txt
Project: West Point Grey Residence
Client: Private Residence
Rooms: 7
Walls: 22
Selected Art Pieces: 14
Estimated Art Budget: $42,800
Pending Approval: 3
To Be Framed: 5
```

---

## 8. Mock Data Requirements

The prototype should include a fictional home with a few realistic spaces.

### Suggested Rooms

* Entry Hall
* Living Room
* Dining Room
* Primary Bedroom
* Stair Hall
* Upper Hallway

### Suggested Art Count

Use approximately 10–15 art pieces.

### Suggested Wall Count

Use approximately 12–20 walls across the rooms.

### Art Imagery

Use stock photography or placeholder art images from a public/stock source.

The images should feel appropriate for high-end residential interiors:

* Abstract paintings
* Framed photography
* Minimal line drawings
* Sculptural wall objects
* Textile or mixed-media pieces

---

## 9. Data Model

### Project

```js
{
  id: "project-001",
  name: "West Point Grey Residence",
  clientName: "Private Client",
  totalBudget: 42800
}
```

### Room

```js
{
  id: "room-living",
  name: "Living Room",
  type: "Living Space",
  wallIds: ["wall-living-north", "wall-living-east"]
}
```

### Wall

```js
{
  id: "wall-living-north",
  roomId: "room-living",
  name: "North Wall",
  lengthInches: 144,
  heightInches: 108,
  segments: [
    { start: 0, end: 12, usable: false, reason: "Corner clearance" },
    { start: 12, end: 48, usable: true },
    { start: 48, end: 72, usable: false, reason: "Fireplace surround" },
    { start: 72, end: 120, usable: true },
    { start: 120, end: 144, usable: false, reason: "Built-in shelving" }
  ]
}
```

### Art Piece

```js
{
  id: "art-001",
  title: "Blue Fragment Study",
  artist: "Mara Ellison",
  medium: "Acrylic on canvas",
  imageUrl: "placeholder-url",
  widthInches: 36,
  heightInches: 48,
  price: 3200,
  status: "Selected",
  roomId: "room-living",
  wallId: "wall-living-north",
  placement: {
    startInches: 42,
    centerHeightInches: 60
  }
}
```

---

## 10. Visual Design Direction

The interface should feel like a professional interior design specification tool.

### Style

* Minimal
* High-end
* Spacious
* Neutral palette
* Strong typography
* Large thumbnails
* Clear measurement labels
* Simple dashboard cards
* Subtle borders and dividers

### Avoid

* Heavy colors
* Consumer-shopping visual language
* Overly playful UI
* Crowded tables
* Generic admin-dashboard styling

---

## 11. Key UX Requirements

### Art List

The art list should support quick scanning.

Recommended layout:

* Thumbnail on the left
* Main metadata in the center
* Placement and price on the right
* Wall link/action clearly visible

### Room List

The room list should make spatial organization clear.

Recommended layout:

* Room cards
* Nested wall rows
* Small summary metrics
* Art count per wall

### Wall Detail

The wall detail should be the strongest visual part of the prototype.

It should clearly answer:

* How long is this wall?
* Which parts are unusable?
* Where does each artwork go?
* How large is each artwork relative to the wall?
* What art pieces are assigned here?

---

## 12. Acceptance Criteria

The prototype is successful when:

1. A user can view all art pieces in a single list.
2. A user can view all rooms and walls in a structured list.
3. A user can click from an art piece to its wall detail.
4. A user can click from a wall in the room list to its wall detail.
5. The wall detail renders:

   * Total wall length
   * Usable and unusable wall sections
   * Art pieces positioned along the wall
6. The mock data feels like a real high-end residential art placement spec.
7. The prototype clearly communicates the future product direction without requiring editing features.

---

## 13. Suggested Prototype Implementation

Build as a single-page app with hardcoded mock data.

Recommended routes/views:

```txt
#/summary
#/art
#/rooms
#/wall/:wallId
```

Suggested stack:

* Vanilla JavaScript
* HTML
* CSS
* Hardcoded data object
* No backend
* No authentication
* No persistence required

---

## 14. Future Features

Potential future features after the review prototype:

* Add/edit art pieces
* Upload art images
* Drag-and-drop placement on walls
* Scale-aware wall elevation editing
* Room-by-room approval workflow
* Client comments
* Procurement status tracking
* Framing requirements
* Installer notes
* Export to PDF
* Export installer packet
* Budget tracking
* Alternate art schemes
* Floor plan integration
* AI-assisted art recommendations
