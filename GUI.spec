# GUI.spec

import sys
from PyInstaller.utils.hooks import collect_data_files
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

a = Analysis(
    ['GUI.py'],
    pathex=['/path/to/your/project'],  # Adjust the path as needed
    binaries=[],
    datas=[
        ('credentials.json', '.'),  # Include credentials.json in the build
        ('Cook_IT.py', '.')         # Include Cook_IT.py in the build
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    cipher=block_cipher,
    noarchive=False
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    name='GUI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,  # Set to True if you want a console window
    windowed=True,  # Set to False if you want a console window
    cipher=block_cipher,
    hooksconfig={}
)
