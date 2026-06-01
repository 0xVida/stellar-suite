import { useEffect } from 'react';
import { useFileStore } from '@/store/useFileStore';
import { CommandRegistry } from '@/lib/commands/CommandRegistry';

export const useKeyboardShortcutManager = () => {
  const { markSaved, activeTabPath, files } = useFileStore();

  useEffect(() => {
    const saveCurrentFile = () => {
      if (activeTabPath.length > 0) {
        markSaved(activeTabPath);
        // Trigger save event - in a real IDE, this would save to disk
        console.log('File saved:', activeTabPath.join('/'));
      }
    };

    const triggerBuild = () => {
      // Trigger build event
      window.dispatchEvent(new Event('ide:build'));
      console.log('Build triggered');
    };

    const openFileFinder = () => {
      // Trigger file finder
      window.dispatchEvent(new Event('ide:open-file-finder'));
      console.log('File finder opened');
    };

    const openSearch = () => {
      // Trigger search (already exists in App.tsx)
      window.dispatchEvent(new Event('ide:open-search'));
      console.log('Search opened');
    };

    const openCommandPalette = () => {
      // Toggle command palette (already exists in App.tsx)
      window.dispatchEvent(new Event('ide:toggle-command-palette'));
      console.log('Command palette toggled');
    };

    const openHotkeysModal = () => {
      // Trigger hotkeys modal
      window.dispatchEvent(new Event('ide:open-hotkeys'));
      console.log('Hotkeys modal opened');
    };

    CommandRegistry.register({
      id: 'ide.saveFile',
      title: 'Save current file',
      description: 'Save the currently active file',
      category: 'Editor',
      defaultKeys: { key: 's', metaKey: true },
      action: saveCurrentFile,
    });

    CommandRegistry.register({
      id: 'ide.build',
      title: 'Build project',
      description: 'Compile the current project',
      category: 'Build',
      defaultKeys: { key: 'b', metaKey: true },
      action: triggerBuild,
    });

    CommandRegistry.register({
      id: 'ide.openFileFinder',
      title: 'Open file finder',
      description: 'Quickly navigate to any file',
      category: 'Navigation',
      defaultKeys: { key: 'p', metaKey: true },
      action: openFileFinder,
    });

    CommandRegistry.register({
      id: 'ide.openSearch',
      title: 'Search in files',
      description: 'Global search across the workspace',
      category: 'Navigation',
      defaultKeys: { key: 'f', metaKey: true, shiftKey: true },
      action: openSearch,
    });

    CommandRegistry.register({
      id: 'ide.openCommandPalette',
      title: 'Toggle command palette',
      description: 'Access all commands quickly',
      category: 'Navigation',
      defaultKeys: { key: 'k', metaKey: true },
      action: openCommandPalette,
    });

    CommandRegistry.register({
      id: 'ide.openHotkeys',
      title: 'Show keyboard shortcuts',
      description: 'View and edit keyboard shortcuts',
      category: 'System',
      defaultKeys: { key: '/', metaKey: true },
      action: openHotkeysModal,
    });

    CommandRegistry.register({
      id: 'ide.openHotkeysAlt',
      title: 'Show keyboard shortcuts (Alt)',
      description: 'Alternative shortcut to view keybindings',
      category: 'System',
      defaultKeys: { key: '?', shiftKey: true },
      action: openHotkeysModal,
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      CommandRegistry.handleKeyboardEvent(event);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      CommandRegistry.unregister('ide.saveFile');
      CommandRegistry.unregister('ide.build');
      CommandRegistry.unregister('ide.openFileFinder');
      CommandRegistry.unregister('ide.openSearch');
      CommandRegistry.unregister('ide.openCommandPalette');
      CommandRegistry.unregister('ide.openHotkeys');
      CommandRegistry.unregister('ide.openHotkeysAlt');
    };
  }, [activeTabPath, files, markSaved]);

  return { shortcuts: CommandRegistry.getAllCommands() };
};
