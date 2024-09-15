# GUI.spec

import sys
import os
from PyInstaller.utils.hooks import collect_data_files
from PyInstaller.utils.hooks import collect_submodules

# Get the path to the current directory (where the .spec file is located)
current_dir = os.path.dirname(os.path.abspath(sys.argv[0]))

# Define the relative path to the source directory where GUI.py is located
source_dir = os.path.join(current_dir, '../source/')

block_cipher = None

a = Analysis(
    [os.path.join(source_dir, 'GUI.py')],  # Use relative path to GUI.py
    pathex=[source_dir],                   # Set the search path to source_dir
    binaries=[],
    datas=[
        (os.path.join(source_dir, 'credentials.json'), '.'),  # Include credentials.json in the build
        (os.path.join(source_dir, 'Cook_IT.py'), '.'),         # Include Cook_IT.py
        ('..\\resource\\Cook-IT.ico', 'resource')  # Include the icon as a data file
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
    name='Cook-IT',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=False,
    console=False,  # Set to True if you want a console window
    windowed=True,  # Set to False if you want a console window
    icon=['.\\Cook-IT.ico'],
    cipher=block_cipher,
    hooksconfig={}
)
