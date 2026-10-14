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
export type MilestoneListItem = Milestone & { task_count: number };

// Tasks
export type Task = Omit<Tables<"tasks">, "status"> & { status: TaskStatus };
export type TaskInsert = Omit<TablesInsert<"tasks">, "status"> & { status?: TaskStatus };
export type TaskUpdate = Omit<TablesUpdate<"tasks">, "status"> & { status?: TaskStatus };
