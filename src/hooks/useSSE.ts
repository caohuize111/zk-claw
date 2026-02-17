"use client";
import { useState, useEffect, useCallback } from "react";

interface SSEState {
  status: "idle" | "connecting" | "connected" | "error";
  data: any;
  error: string | null;
  progress: number;
  step: string;
}

export function useSSE(taskId: string | null) {
  const [state, setState] = useState<SSEState>({
    status: "idle",
    data: null,
    error: null,
    progress: 0,
    step: "",
  });

  useEffect(() => {
    if (!taskId) return;

    setState((s) => ({ ...s, status: "connecting" }));
    const es = new EventSource(`/api/sse?taskId=${taskId}`);

    es.onopen = () => setState((s) => ({ ...s, status: "connected" }));

    es.addEventListener("progress", (e) => {
      const data = JSON.parse(e.data);
      setState((s) => ({ ...s, progress: data.progress, step: data.step }));
    });

    es.addEventListener("completed", (e) => {
      const data = JSON.parse(e.data);
      setState({ status: "idle", data: data.result, error: null, progress: 100, step: "completed" });
      es.close();
    });

    es.addEventListener("failed", (e) => {
      const data = JSON.parse(e.data);
      setState({ status: "error", data: null, error: data.error, progress: 0, step: "failed" });
      es.close();
    });

    es.onerror = () => {
      setState((s) => ({ ...s, status: "error", error: "Connection lost" }));
      es.close();
    };

    return () => es.close();
  }, [taskId]);

  const reset = useCallback(() => {
    setState({ status: "idle", data: null, error: null, progress: 0, step: "" });
  }, []);

  return { ...state, reset };
}
