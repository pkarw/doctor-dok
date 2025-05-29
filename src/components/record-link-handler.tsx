import { useEffect } from 'react';
import { toast } from 'sonner';

export default function RecordLinkHandler() {
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#records-')) {
        const recordIds = hash.replace('#records-', '');
        toast.info(`Record(s) ${recordIds} referenced`);
      }
    };

    // Handle initial load
    handleHashChange();

    // Add event listener for hash changes
    window.addEventListener('hashchange', handleHashChange);

    // Cleanup
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return null;
} 