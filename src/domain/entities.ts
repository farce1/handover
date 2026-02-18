import {
  ProjectSchema,
  ModuleSchema,
  SourceFileSchema,
  FeatureSchema,
  DependencySchema,
  EnvConfigSchema,
} from './schemas.js';
import type { Project, Module, SourceFile, Feature, Dependency, EnvConfig } from './types.js';

/**
 * Create a new Project with sensible defaults.
 * All values are validated through the Zod schema.
 */
export function createProject(
  name: string,
  language: string,
  overrides?: Partial<Project>,
): Project {
  return ProjectSchema.parse({
    name,
    language,
    modules: [],
    features: [],
    patterns: [],
    dependencies: [],
    envConfig: [],
    conventions: [],
    ...overrides,
  });
}

/**
 * Create an empty Module shell.
 */
export function createModule(name: string, path: string, purpose: string = ''): Module {
  return ModuleSchema.parse({
    name,
    path,
    purpose,
    files: [],
    edgeCases: [],
    techDebt: [],
    publicAPI: [],
  });
}

/**
 * Create a minimal SourceFile entry.
 */
export function createSourceFile(
  path: string,
  language: SourceFile['language'],
  lineCount: number = 1,
): SourceFile {
  return SourceFileSchema.parse({
    path,
    language,
    exports: [],
    imports: [],
    lineCount,
    complexity: 0,
  });
}

/**
 * Create a Feature entry.
 */
export function createFeature(name: string, description: string): Feature {
  return FeatureSchema.parse({
    name,
    description,
    entryPoints: [],
    modules: [],
    crossCutting: false,
  });
}

/**
 * Create a Dependency entry.
 */
export function createDependency(
  name: string,
  version: string,
  purpose: string,
  type: Dependency['type'] = 'production',
  criticality: Dependency['criticality'] = 'important',
): Dependency {
  return DependencySchema.parse({
    name,
    version,
    type,
    purpose,
    criticality,
  });
}

/**
 * Create an EnvConfig entry.
 */
export function createEnvConfig(
  name: string,
  description: string,
  options?: {
    required?: boolean;
    secret?: boolean;
    defaultValue?: string;
  },
): EnvConfig {
  return EnvConfigSchema.parse({
    name,
    required: options?.required ?? true,
    secret: options?.secret ?? false,
    defaultValue: options?.defaultValue,
    description,
    usedBy: [],
  });
}
