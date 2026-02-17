import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const PROVER_URL = process.env.PROVER_SERVICE_URL || "";
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  if (!PROVER_URL) {
    return new Response("Prover service not configured", { status: 503 });
  }

  const taskId = request.nextUrl.searchParams.get("taskId");
  if (!taskId || !UUID_REGEX.test(taskId)) {
    return new Response("Invalid taskId format", { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max

      const poll = async () => {
        try {
          const res = await fetch(`${PROVER_URL}/prove/${taskId}`);
          if (!res.ok) {
            send("failed", { error: "Prover service unavailable" });
            controller.close();
            return;
          }

          const data = await res.json();

          if (data.status === "completed") {
            send("completed", { result: data.result });
            controller.close();
            return;
          }

          if (data.status === "failed") {
            send("failed", { error: data.error });
            controller.close();
            return;
          }

          // Still running
          const progress = data.status === "running" ? 50 : 10;
          send("progress", { progress, step: data.status });

          attempts++;
          if (attempts >= maxAttempts) {
            send("failed", { error: "Timeout" });
            controller.close();
            return;
          }

          setTimeout(poll, 1000);
        } catch (err: any) {
          send("failed", { error: err.message });
          controller.close();
        }
      };

      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
