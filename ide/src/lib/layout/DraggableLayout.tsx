"use client";

/**
 * DraggableLayout
 *
 * Provides drag-and-drop reordering for:
 *  - Editor tabs (horizontal list)
 *  - Sidebar icons (vertical list)
 *
 * Uses @dnd-kit/core + @dnd-kit/sortable.
 * Layout order is persisted via the layoutOrderStore (zustand + localStorage).
 */

import React, { createContext, useContext } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// ── Persistence store ─────────────────────────────────────────────────────────

interface LayoutOrderState {
  /** Ordered list of tab IDs */
  tabOrder: string[];
  /** Ordered list of sidebar item IDs */
  sidebarOrder: string[];
  setTabOrder: (order: string[]) => void;
  setSidebarOrder: (order: string[]) => void;
}

export const useLayoutOrderStore = create<LayoutOrderState>()(
  persist(
    (set) => ({
      tabOrder: [],
      sidebarOrder: [],
      setTabOrder: (order) => set({ tabOrder: order }),
      setSidebarOrder: (order) => set({ sidebarOrder: order }),
    }),
    {
      name: "stellar-layout-order",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

// ── Context ───────────────────────────────────────────────────────────────────

interface DraggableLayoutContextValue {
  tabOrder: string[];
  sidebarOrder: string[];
}

const DraggableLayoutContext = createContext<DraggableLayoutContextValue>({
  tabOrder: [],
  sidebarOrder: [],
});

export function useDraggableLayout() {
  return useContext(DraggableLayoutContext);
}

// ── DraggableTabList ──────────────────────────────────────────────────────────

interface DraggableTabListProps {
  /** Stable IDs for each tab, in display order */
  ids: string[];
  children: (id: string, index: number) => React.ReactNode;
  className?: string;
}

/**
 * Wraps a horizontal list of editor tabs with drag-and-drop reordering.
 * Persists the new order to localStorage via useLayoutOrderStore.
 */
export function DraggableTabList({ ids, children, className }: DraggableTabListProps) {
  const { tabOrder, setTabOrder } = useLayoutOrderStore();

  // Merge persisted order with current ids (handles new tabs added after persist)
  const orderedIds = React.useMemo(() => {
    const persisted = tabOrder.filter((id) => ids.includes(id));
    const newIds = ids.filter((id) => !tabOrder.includes(id));
    return [...persisted, ...newIds];
  }, [ids, tabOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Require 8px movement before drag starts — prevents accidental reorder on click
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      setTabOrder(arrayMove(orderedIds, oldIndex, newIndex));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={horizontalListSortingStrategy}>
        <div className={className} style={{ display: "flex", flexDirection: "row" }}>
          {orderedIds.map((id, index) => children(id, index))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── DraggableSidebarList ──────────────────────────────────────────────────────

interface DraggableSidebarListProps {
  ids: string[];
  children: (id: string, index: number) => React.ReactNode;
  className?: string;
}

/**
 * Wraps a vertical list of sidebar icons with drag-and-drop reordering.
 * Persists the new order to localStorage via useLayoutOrderStore.
 */
export function DraggableSidebarList({ ids, children, className }: DraggableSidebarListProps) {
  const { sidebarOrder, setSidebarOrder } = useLayoutOrderStore();

  const orderedIds = React.useMemo(() => {
    const persisted = sidebarOrder.filter((id) => ids.includes(id));
    const newIds = ids.filter((id) => !sidebarOrder.includes(id));
    return [...persisted, ...newIds];
  }, [ids, sidebarOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = orderedIds.indexOf(active.id as string);
      const newIndex = orderedIds.indexOf(over.id as string);
      setSidebarOrder(arrayMove(orderedIds, oldIndex, newIndex));
    }
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
        <div className={className} style={{ display: "flex", flexDirection: "column" }}>
          {orderedIds.map((id, index) => children(id, index))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ── SortableItem ──────────────────────────────────────────────────────────────

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Wrap any tab or sidebar icon with this to make it sortable.
 *
 * @example
 * <DraggableTabList ids={tabIds}>
 *   {(id) => (
 *     <SortableItem key={id} id={id}>
 *       <Tab id={id} />
 *     </SortableItem>
 *   )}
 * </DraggableTabList>
 */
export function SortableItem({ id, children, className }: SortableItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    cursor: isDragging ? "grabbing" : "grab",
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={className} {...attributes} {...listeners}>
      {children}
    </div>
  );
}
