import { useEffect, useState } from 'react';
import type { NeuronDataset } from '../data/types';
import { loadNeuronDataset } from '../data/dataLoader';

export function useNeuronData(): { data: NeuronDataset | null; error: string | null } {
  const [data, setData] = useState<NeuronDataset | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNeuronDataset().then(
      (ds) => {
        if (!cancelled) setData(ds);
      },
      (err) => {
        if (!cancelled) setError(err.message ?? String(err));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, error };
}
