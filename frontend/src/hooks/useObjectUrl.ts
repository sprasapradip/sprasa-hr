import { useEffect, useState } from 'react';
import { objectUrl } from '@/lib/api';

/** Load a protected file (photo, logo) through the authenticated API as an object URL. */
export function useObjectUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let revoked = false;
    let created: string | null = null;
    objectUrl(path)
      .then((u) => {
        if (revoked) URL.revokeObjectURL(u);
        else {
          created = u;
          setUrl(u);
        }
      })
      .catch(() => setUrl(null));
    return () => {
      revoked = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [path]);
  return url;
}
