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
  agents: Array<{
    id: string;
    name: string;
    workspace?: string;
    skillsCount: number;
    skills: string[];
    cronTotal: number;
    cronErrors: number;
  }>;
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

async function safeDirList(dirPath: string) {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const openclawDir = resolveOpenclawPath();
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

    const cronStdout = await execFileAsync("openclaw", ["cron", "list", "--json"], {
      timeout: 10000,
    }).then((r) => r.stdout);

    const cronJson = JSON.parse(cronStdout) as {
      jobs?: Array<{ agentId?: string; state?: { lastStatus?: string } }>;
    };

    const jobs = cronJson.jobs ?? [];

    const agents = await Promise.all(
      agentList.map(async (agent) => {
        const skillsDir = agent.workspace
          ? path.join(agent.workspace, "skills")
          : "";
        const skills = skillsDir ? await safeDirList(skillsDir) : [];
        const agentJobs = jobs.filter((j) => j.agentId === agent.id);
        const cronErrors = agentJobs.filter(
          (j) => j.state?.lastStatus === "error",
        ).length;

        return {
          ...agent,
          skillsCount: skills.length,
          skills,
          cronTotal: agentJobs.length,
          cronErrors,
        };
      }),
    );

    const snapshot: Snapshot = {
      generatedAt: new Date().toISOString(),
      source: "openclaw.json + openclaw cron list",
      agents,
      totals: {
        agents: agents.length,
        cron: jobs.length,
        cronErrors: jobs.filter((j) => j.state?.lastStatus === "error").length,
      },
    };

    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      {
        error: "crew snapshot unavailable",
        detail: error instanceof Error ? error.message : "unknown",
      },
      { status: 500 },
    );
  }
}
