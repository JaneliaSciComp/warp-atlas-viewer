import { useEffect, useState } from 'react';
import type { NeuronDataset } from '../data/types';
import { loadNeuronDataset, type LoadProgress } from '../data/dataLoader';

interface UseNeuronData {
  data: NeuronDataset | null;
  error: string | null;
  progress: LoadProgress | null;
}

export function useNeuronData(): UseNeuronData {
  const [data, setData] = useState<NeuronDataset | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<LoadProgress | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadNeuronDataset((p) => {
      if (!cancelled) setProgress(p);
    }).then(
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

  return { data, error, progress };
}
