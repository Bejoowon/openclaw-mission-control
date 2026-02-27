import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type AgentEntry = {
  id?: string;
  name?: string;
  workspace?: string;
};

type Snapshot = {
  generatedAt: string;
  source: string;
  stale?: boolean;
  warning?: string;
  agents: Array<{
    id: string;
    name: string;
    workspace?: string;
    skillsCount: number;
    skills: string[];
    cronTotal: number;
    cronErrors: number;
  }>;
  cronJobs: Array<{
    id: string;
    name: string;
    agentId: string;
    enabled: boolean;
    nextRun: string;
    lastRun: string;
    status: string;
    error?: string;
  }>;
  care: {
    reportPath: string;
    reportPreview: string[];
  };
  totals: {
    agents: number;
    cron: number;
    cronErrors: number;
  };
};

function resolveOpenclawPath() {
  const envPath = process.env.OPENCLAW_DIR;
  if (envPath) return envPath;
  return path.join(os.homedir(), ".openclaw");
}

function cachePath(openclawDir: string) {
  return path.join(openclawDir, "dashboard", "crew-snapshot-cache.json");
}

async function safeDirList(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

function fmt(ms?: number) {
  if (!ms) return "-";
  return new Date(ms).toISOString();
}

async function readReportPreview(reportPath: string) {
  try {
    const raw = await fs.readFile(reportPath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 8);
  } catch {
    return ["(점검 보고서 없음)"];
  }
}

async function readCachedSnapshot(openclawDir: string): Promise<Snapshot | null> {
  try {
    const raw = await fs.readFile(cachePath(openclawDir), "utf8");
    return JSON.parse(raw) as Snapshot;
  } catch {
    return null;
  }
}

async function writeCachedSnapshot(openclawDir: string, snapshot: Snapshot) {
  try {
    const p = cachePath(openclawDir);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify(snapshot), "utf8");
  } catch {
    // ignore cache write failure
  }
}

export async function GET() {
  const openclawDir = resolveOpenclawPath();

  try {
    const configPath = path.join(openclawDir, "openclaw.json");
    const configRaw = await fs.readFile(configPath, "utf8");
    const config = JSON.parse(configRaw) as {
      agents?: { list?: AgentEntry[] };
    };

    const agentList = (config.agents?.list ?? [])
      .filter((a) => a.id)
      .map((a) => ({
        id: a.id as string,
        name: a.name || (a.id as string),
        workspace: a.workspace,
      }));

    let jobs: Array<{
      id?: string;
      name?: string;
      enabled?: boolean;
      agentId?: string;
      state?: {
        nextRunAtMs?: number;
        lastRunAtMs?: number;
        lastStatus?: string;
        lastError?: string;
      };
    }> = [];

    try {
      const cronStdout = await execFileAsync("openclaw", ["cron", "list", "--json"], {
        timeout: 5000,
      }).then((r) => r.stdout);

      const cronJson = JSON.parse(cronStdout) as { jobs?: typeof jobs };
      jobs = cronJson.jobs ?? [];
    } catch {
      jobs = [];
    }

    const agents = await Promise.all(
      agentList.map(async (agent) => {
        const skillsDir = agent.workspace ? path.join(agent.workspace, "skills") : "";
        const skills = skillsDir ? await safeDirList(skillsDir) : [];
        const agentJobs = jobs.filter((j) => j.agentId === agent.id);
        const cronErrors = agentJobs.filter((j) => j.state?.lastStatus === "error").length;

        return {
          ...agent,
          skillsCount: skills.length,
          skills,
          cronTotal: agentJobs.length,
          cronErrors,
        };
      }),
    );

    const cronJobs = jobs
      .filter((j) => j.agentId)
      .map((j) => ({
        id: j.id ?? "-",
        name: j.name ?? "-",
        agentId: j.agentId ?? "-",
        enabled: Boolean(j.enabled),
        nextRun: fmt(j.state?.nextRunAtMs),
        lastRun: fmt(j.state?.lastRunAtMs),
        status: j.state?.lastStatus ?? "pending",
        error: j.state?.lastError,
      }));

    const reportPath = path.join(openclawDir, "agents", "8lomi", "tmp", "agent_review_report.md");
    const reportPreview = await readReportPreview(reportPath);

    const snapshot: Snapshot = {
      generatedAt: new Date().toISOString(),
      source: "openclaw.json + openclaw cron list",
      agents,
      cronJobs,
      care: {
        reportPath,
        reportPreview,
      },
      totals: {
        agents: agents.length,
        cron: jobs.length,
        cronErrors: jobs.filter((j) => j.state?.lastStatus === "error").length,
      },
    };

    await writeCachedSnapshot(openclawDir, snapshot);
    return NextResponse.json(snapshot);
  } catch (error) {
    const cached = await readCachedSnapshot(openclawDir);
    if (cached) {
      return NextResponse.json({
        ...cached,
        stale: true,
        warning: "실시간 상태 조회에 실패해 최근 캐시를 보여줘요.",
      });
    }

    const fallback: Snapshot = {
      generatedAt: new Date().toISOString(),
      source: "fallback",
      stale: true,
      warning: "상태 데이터를 불러오지 못했어요. 잠시 후 다시 시도해줘.",
      agents: [],
      cronJobs: [],
      care: {
        reportPath: "-",
        reportPreview: ["(점검 보고서 없음)"],
      },
      totals: { agents: 0, cron: 0, cronErrors: 0 },
    };

    return NextResponse.json(fallback);
  }
}
