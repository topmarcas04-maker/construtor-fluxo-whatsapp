export interface CourseCard {
  id: string;
  title: string;
  description: string | null;
  cover: string | null;
  premium: boolean;
  published: boolean;
  sort: number;
  own: boolean;
  locked: boolean;
  lessons: number;
  minutes: number;
  completed: number;
}

export interface Lesson {
  id: string;
  courseId: string;
  moduleId: string | null;
  title: string;
  description: string | null;
  videoUrl: string | null;
  hasVideo: boolean;
  driveFileIds: string[];
  durationMin: number | null;
  premium: boolean;
  published: boolean;
  sort: number;
  locked: boolean;
  done: boolean;
  files: { id: string; name: string; kind: string; size: number }[];
}

export interface CourseDetail {
  course: CourseCard & { accountId: string };
  canEdit: boolean;
  modules: { id: string; title: string; sort: number }[];
  lessons: Lesson[];
}
