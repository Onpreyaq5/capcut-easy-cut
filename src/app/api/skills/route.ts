import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';

const SKILLS_DIR = path.join(process.cwd(), 'data', 'skills');

async function ensureSkillsDir() {
  await fs.mkdir(SKILLS_DIR, { recursive: true });
}

export async function POST(req: NextRequest) {
  try {
    await ensureSkillsDir();
    const body = await req.json();
    const { action, ...data } = body;

    switch (action) {
      case 'list-skills': {
        const entries = await fs.readdir(SKILLS_DIR, { withFileTypes: true });
        const skills = [];
        for (const entry of entries) {
          if (entry.isDirectory() && !entry.name.startsWith('.')) {
            const skillPath = path.join(SKILLS_DIR, entry.name);
            const mdPath = path.join(skillPath, `${entry.name}.md`);
            try {
              const content = await fs.readFile(mdPath, 'utf8');
              const nameMatch = content.match(/name:\s*(.+)/);
              const descMatch = content.match(/description:\s*(.+)/);
              skills.push({
                name: entry.name,
                displayName: nameMatch ? nameMatch[1].trim() : entry.name,
                description: descMatch ? descMatch[1].trim() : '',
                path: skillPath
              });
            } catch (e) {
              skills.push({
                name: entry.name,
                displayName: entry.name,
                description: 'Unknown skill',
                path: skillPath
              });
            }
          }
        }
        return NextResponse.json(skills);
      }

      case 'create-skill': {
        const { name, description, content } = data;
        const skillName = name.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const skillPath = path.join(SKILLS_DIR, skillName);
        await fs.mkdir(skillPath, { recursive: true });
        await fs.writeFile(path.join(skillPath, `${skillName}.md`), content);
        return NextResponse.json({ success: true, skillPath });
      }

      case 'save-skill': {
        const { skillPath, content } = data;
        const name = path.basename(skillPath);
        await fs.writeFile(path.join(skillPath, `${name}.md`), content);
        return NextResponse.json({ success: true });
      }

      case 'delete-skill': {
        const { skillPath } = data;
        await fs.rm(skillPath, { recursive: true, force: true });
        return NextResponse.json({ success: true });
      }

      case 'list-skill-files': {
        const { skillPath } = data;
        
        async function buildFileTree(dirPath: string, relativePath = '') {
          const entries = await fs.readdir(dirPath, { withFileTypes: true });
          const tree: any[] = [];
          for (const entry of entries) {
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
            const fullPath = path.join(dirPath, entry.name);
            const relPath = relativePath ? path.join(relativePath, entry.name) : entry.name;
            if (entry.isDirectory()) {
              const subtree = await buildFileTree(fullPath, relPath);
              tree.push({ name: entry.name, path: relPath, type: 'folder', children: subtree });
            } else {
              const stats = await fs.stat(fullPath);
              tree.push({ name: entry.name, path: relPath, type: 'file', size: stats.size, editable: true });
            }
          }
          return tree.sort((a, b) => a.type === 'folder' ? -1 : 1);
        }

        const tree = await buildFileTree(skillPath);
        return NextResponse.json(tree);
      }

      case 'load-file': {
        const { filePath } = data;
        const content = await fs.readFile(filePath, 'utf8');
        return NextResponse.json({ content });
      }

      default:
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
