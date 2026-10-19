import type { Tables, TablesInsert, TablesUpdate } from "@/db/database.types";

export const LIFE_AREAS = ["dom", "sport", "praca"] as const;
export type LifeArea = (typeof LIFE_AREAS)[number];

export const TASK_STATUSES = ["todo", "partial", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

// Projects
export type Project = Omit<Tables<"projects">, "life_area"> & { life_area: LifeArea };
export type ProjectInsert = Omit<TablesInsert<"projects">, "life_area"> & { life_area: LifeArea };
export type ProjectUpdate = Omit<TablesUpdate<"projects">, "life_area"> & { life_area?: LifeArea };

// Milestones
export type Milestone = Tables<"milestones">;
export type MilestoneInsert = TablesInsert<"milestones">;
export type MilestoneUpdate = TablesUpdate<"milestones">;

// Tasks
export type Task = Omit<Tables<"tasks">, "status"> & { status: TaskStatus };
export type MilestoneListItem = Milestone & { task_count: number; tasks: Task[] };
export type TaskInsert = Omit<TablesInsert<"tasks">, "status"> & { status?: TaskStatus };
export type TaskUpdate = Omit<TablesUpdate<"tasks">, "status"> & { status?: TaskStatus };

// Today view
export interface TodayTask {
  id: string;
  title: string;
  due_date: string | null;
  status: TaskStatus;
  project: { id: string; name: string };
  milestone: { id: string; name: string; due_date: string };
}
/** A recurring task whose rhythm makes today an occurrence; it has no own due date. */
export interface TodayRoutine {
  id: string;
  title: string;
  interval_days: number;
  project: { id: string; name: string };
  milestone: { id: string; name: string; due_date: string };
}
export interface TodayMilestone {
  id: string;
  name: string;
  due_date: string;
  project: { id: string; name: string };
}
export type TodayDeferredTask = TodayTask & { deferred_until: string };

// Targets of the "add task" form on the today list: projects with an open milestone.
export type TaskTargetMilestone = Pick<Milestone, "id" | "name" | "due_date">;
/** `milestones` are open ones sorted from the nearest, so the first is the "nearest open" milestone of the project. */
export interface TaskTargetProject {
  id: string;
  name: string;
  milestones: TaskTargetMilestone[];
}
export interface TodayView {
  routines: TodayRoutine[];
  tasks: TodayTask[];
  milestones: TodayMilestone[];
  deferred: TodayDeferredTask[];
}
