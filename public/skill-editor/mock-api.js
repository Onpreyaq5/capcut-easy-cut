window.electronAPI = {
  _call: async (action, data) => {
    try {
      const res = await fetch('/api/skills', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      return await res.json();
    } catch (e) {
      console.error(e);
      throw e;
    }
  },
  createSkill: (skillData) => window.electronAPI._call('create-skill', skillData),
  loadSkill: (skillPath) => window.electronAPI._call('load-skill', { skillPath }),
  saveSkill: (data) => window.electronAPI._call('save-skill', data),
  createZip: (data) => window.electronAPI._call('create-zip', data),
  deleteSkill: (data) => window.electronAPI._call('delete-skill', data),
  openFileDialog: () => { alert('Not supported in web version'); return null; },
  listSkills: () => window.electronAPI._call('list-skills', {}),
  startDrag: (zipPath, skillName) => alert('Drag not supported in web version. Use Download.'),
  onDragError: (callback) => {}, // Ignore

  listSkillFiles: (skillPath) => window.electronAPI._call('list-skill-files', { skillPath }),
  createFile: (data) => window.electronAPI._call('create-file', data),
  createFolder: (data) => window.electronAPI._call('create-folder', data),
  deleteFileOrFolder: (data) => window.electronAPI._call('delete-file-or-folder', data),
  renameFileOrFolder: (data) => window.electronAPI._call('rename-file-or-folder', data),
  loadFile: (data) => window.electronAPI._call('load-file', data),
  uploadFiles: (data) => window.electronAPI._call('upload-files', data),
  moveFile: (data) => window.electronAPI._call('move-file', data),

  openSkillFileDialog: () => { alert('Not supported in web version'); return null; },
  importSkillPackage: (data) => window.electronAPI._call('import-skill-package', data),
  confirmImportSkill: (data) => window.electronAPI._call('confirm-import-skill', data)
};
