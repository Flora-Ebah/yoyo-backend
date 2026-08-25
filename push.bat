@echo off
REM Vérifie si un message de commit est fourni
if "%1"=="" (
    echo Vous devez fournir un message de commit.
    exit /b 1
)

REM Ajoute tous les fichiers
git add .

REM Fait le commit avec le message fourni
git commit -m "%*"

REM Pousse les modifications sur la branche dev
git push origin dev

REM Change de branche vers main
git checkout main

REM Fait un pull des modifications depuis dev
git pull origin dev

REM Pousse les modifications sur la branche main
git push origin main

REM Revient à la branche dev
git checkout dev
