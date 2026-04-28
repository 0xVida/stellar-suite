import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '@/components/ide/Breadcrumbs';
import { useWorkspaceStore } from '@/store/workspaceStore';
import type { FileNode } from '@/lib/sample-contracts';

// Mock the workspace store
vi.mock('@/store/workspaceStore', () => ({
  useWorkspaceStore: vi.fn(),
}));

describe('Breadcrumbs', () => {
  const mockFiles: FileNode[] = [
    {
      name: 'project',
      type: 'folder',
      children: [
        {
          name: 'src',
          type: 'folder',
          children: [
            { name: 'lib.rs', type: 'file', content: 'fn main() {}' },
            { name: 'utils.rs', type: 'file', content: 'pub fn helper() {}' },
          ],
        },
        {
          name: 'tests',
          type: 'folder',
          children: [
            { name: 'test.rs', type: 'file', content: '#[test]' },
          ],
        },
        { name: 'Cargo.toml', type: 'file', content: '[package]' },
      ],
    },
  ];

  const mockSetActiveTabPath = vi.fn();
  const mockAddTab = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render breadcrumb segments for nested file', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project', 'src', 'lib.rs'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    expect(screen.getByText('project')).toBeInTheDocument();
    expect(screen.getByText('src')).toBeInTheDocument();
    expect(screen.getByText('lib.rs')).toBeInTheDocument();
  });

  it('should render nothing when no active file', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: [],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    const { container } = render(<Breadcrumbs />);
    expect(container.firstChild).toBeNull();
  });

  it('should highlight the active file segment', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project', 'src', 'lib.rs'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    const libRsButton = screen.getByText('lib.rs').closest('button');
    expect(libRsButton).toHaveClass('bg-primary/10');
    expect(libRsButton).toHaveClass('text-primary');
  });

  it('should render chevron separators between segments', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project', 'src', 'lib.rs'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    const { container } = render(<Breadcrumbs />);
    
    // Should have 2 chevrons for 3 segments
    const chevrons = container.querySelectorAll('svg[class*="lucide-chevron-right"]');
    expect(chevrons.length).toBe(2);
  });

  it('should render file icon for file segments', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project', 'src', 'lib.rs'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    // lib.rs should have a file icon
    const libRsButton = screen.getByText('lib.rs').closest('button');
    expect(libRsButton?.querySelector('svg')).toBeInTheDocument();
  });

  it('should render folder icon for folder segments', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project', 'src', 'lib.rs'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    // src should have a folder icon
    const srcButton = screen.getByText('src').closest('button');
    expect(srcButton?.querySelector('svg')).toBeInTheDocument();
  });

  it('should handle single-level path', () => {
    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['project'],
      files: mockFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    expect(screen.getByText('project')).toBeInTheDocument();
    
    // No chevrons for single segment
    const { container } = render(<Breadcrumbs />);
    const chevrons = container.querySelectorAll('svg[class*="lucide-chevron-right"]');
    expect(chevrons.length).toBe(0);
  });

  it('should build correct segments for deeply nested files', () => {
    const deepFiles: FileNode[] = [
      {
        name: 'root',
        type: 'folder',
        children: [
          {
            name: 'level1',
            type: 'folder',
            children: [
              {
                name: 'level2',
                type: 'folder',
                children: [
                  { name: 'deep.rs', type: 'file', content: 'code' },
                ],
              },
            ],
          },
        ],
      },
    ];

    (useWorkspaceStore as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      activeTabPath: ['root', 'level1', 'level2', 'deep.rs'],
      files: deepFiles,
      setActiveTabPath: mockSetActiveTabPath,
      addTab: mockAddTab,
    });

    render(<Breadcrumbs />);

    expect(screen.getByText('root')).toBeInTheDocument();
    expect(screen.getByText('level1')).toBeInTheDocument();
    expect(screen.getByText('level2')).toBeInTheDocument();
    expect(screen.getByText('deep.rs')).toBeInTheDocument();
  });
});
