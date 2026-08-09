import { useEffect, useState } from 'react';
import api from '@/services/api';

type Version = { sha: string; built_at: string };

export const BuildVersion = () => {
  const [version, setVersion] = useState<Version | null>(null);

  useEffect(() => {
    api.get<Version>('../version').then(({ data }) => {
      if (/^[0-9a-f]{40}$/.test(data.sha)) setVersion(data);
    }).catch(() => setVersion(null));
  }, []);

  if (!version) return null;
  return (
    <footer className="px-4 pb-2 text-center font-mono text-[10px] text-muted-foreground"
      title={`Built ${version.built_at}`}>
      {version.sha}
    </footer>
  );
};
