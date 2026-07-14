export type GeneratedProjectFile = {
  path: string;
  content: string;
};

export type GeneratedDistFile = {
  content: string;
  contentType: string;
  path: string;
};

export type BuildGeneratedProjectResult = {
  distFiles: GeneratedDistFile[];
  ok: boolean;
  log: string;
};
