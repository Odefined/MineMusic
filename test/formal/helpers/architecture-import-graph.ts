import { existsSync } from "node:fs";
import { dirname, join, normalize, relative, resolve } from "node:path";
import ts from "typescript";

export interface ArchitectureImportEdge {
    readonly fromFile: string;
    readonly specifier: string;
    readonly toFile: string | undefined;
    readonly fromArea: string | undefined;
    readonly toArea: string | undefined;
    readonly fromSubtree: string | undefined;
    readonly toSubtree: string | undefined;
    readonly isTypeOnly: boolean;
    readonly importedNames: readonly string[];
}

export interface ArchitectureImportGraph {
    readonly edges: readonly ArchitectureImportEdge[];
    readonly unresolvedRelativeSpecifiers: readonly ArchitectureImportEdge[];
}

export async function buildArchitectureImportGraph(repositoryRoot: string, sourceFiles: readonly string[]): Promise<ArchitectureImportGraph> {
    const edges: ArchitectureImportEdge[] = [];
    for (const absoluteFile of sourceFiles) {
        const fromFile = normalizeRelativePath(repositoryRoot, absoluteFile);
        const text = ts.sys.readFile(absoluteFile);
        if (text === undefined) {
            throw new Error(`Unable to read source file for architecture import graph: ${fromFile}`);
        }
        const source = ts.createSourceFile(fromFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
        collectImportEdges(source, repositoryRoot, absoluteFile, fromFile, edges);
    }
    return {
        edges,
        unresolvedRelativeSpecifiers: edges.filter((edge) => edge.specifier.startsWith(".") && edge.toFile === undefined),
    };
}

export function isUnderPath(file: string | undefined, pathPrefix: string): boolean {
    return file !== undefined && (file === pathPrefix || file.startsWith(`${pathPrefix}/`));
}

function collectImportEdges(source: ts.SourceFile, repositoryRoot: string, absoluteFile: string, fromFile: string, edges: ArchitectureImportEdge[]): void {
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
            edges.push(createEdge(repositoryRoot, absoluteFile, fromFile, node.moduleSpecifier.text, node.importClause?.isTypeOnly === true, importedNames(node.importClause)));
        }
        else if (ts.isExportDeclaration(node) && node.moduleSpecifier !== undefined && ts.isStringLiteral(node.moduleSpecifier)) {
            edges.push(createEdge(repositoryRoot, absoluteFile, fromFile, node.moduleSpecifier.text, node.isTypeOnly, exportedNames(node.exportClause)));
        }
        else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const [argument] = node.arguments;
            if (argument !== undefined && ts.isStringLiteral(argument)) {
                edges.push(createEdge(repositoryRoot, absoluteFile, fromFile, argument.text, false, []));
            }
        }
        else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
            edges.push(createEdge(repositoryRoot, absoluteFile, fromFile, node.argument.literal.text, true, []));
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
}

function createEdge(repositoryRoot: string, absoluteFile: string, fromFile: string, specifier: string, isTypeOnly: boolean, importedNames: readonly string[]): ArchitectureImportEdge {
    const toFile = resolveSourceSpecifier(repositoryRoot, absoluteFile, specifier);
    return {
        fromFile,
        specifier,
        toFile,
        fromArea: sourceArea(fromFile),
        toArea: sourceArea(toFile),
        fromSubtree: sourceSubtree(fromFile),
        toSubtree: sourceSubtree(toFile),
        isTypeOnly,
        importedNames,
    };
}

function importedNames(importClause: ts.ImportClause | undefined): readonly string[] {
    if (importClause === undefined) {
        return [];
    }
    const names: string[] = [];
    if (importClause.name !== undefined) {
        names.push("default");
    }
    if (importClause.namedBindings !== undefined) {
        if (ts.isNamespaceImport(importClause.namedBindings)) {
            names.push("*");
        }
        else {
            names.push(...importClause.namedBindings.elements.map((element) => (element.propertyName ?? element.name).text));
        }
    }
    return names;
}

function exportedNames(exportClause: ts.NamedExportBindings | undefined): readonly string[] {
    if (exportClause === undefined) {
        return [];
    }
    if (ts.isNamespaceExport(exportClause)) {
        return ["*"];
    }
    return exportClause.elements.map((element) => (element.propertyName ?? element.name).text);
}

function resolveSourceSpecifier(repositoryRoot: string, absoluteFile: string, specifier: string): string | undefined {
    if (!specifier.startsWith(".")) {
        return undefined;
    }
    const base = resolve(dirname(absoluteFile), specifier);
    const candidates = candidateSourcePaths(base);
    const resolvedPath = candidates.find((candidate) => existsSync(candidate));
    if (resolvedPath === undefined) {
        return undefined;
    }
    return normalizeRelativePath(repositoryRoot, resolvedPath);
}

function candidateSourcePaths(base: string): string[] {
    const withoutJs = base.endsWith(".js") ? base.slice(0, -3) : base;
    const withoutTs = base.endsWith(".ts") ? base.slice(0, -3) : base;
    return [
        base,
        `${withoutJs}.ts`,
        `${withoutTs}.ts`,
        join(base, "index.ts"),
        join(withoutJs, "index.ts"),
    ];
}

function sourceArea(file: string | undefined): string | undefined {
    if (file === undefined) {
        return undefined;
    }
    const parts = file.split("/");
    return parts[0] === "src" ? parts[1] : undefined;
}

function sourceSubtree(file: string | undefined): string | undefined {
    if (file === undefined) {
        return undefined;
    }
    const parts = file.split("/");
    if (parts[0] !== "src" || parts.length < 3) {
        return undefined;
    }
    return parts[2];
}

function normalizeRelativePath(repositoryRoot: string, absoluteFile: string): string {
    return relative(repositoryRoot, normalize(absoluteFile)).split("\\").join("/");
}
