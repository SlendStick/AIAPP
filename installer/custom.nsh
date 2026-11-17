!include "MUI2.nsh"
!include "nsDialogs.nsh"
!include "LogicLib.nsh"

Var OrbitDesktopCheck
Var OrbitMenuCheck
Var OrbitDesktopState
Var OrbitMenuState

!macro customInit
  StrCpy $OrbitDesktopState ${BST_CHECKED}
  StrCpy $OrbitMenuState ${BST_CHECKED}
!macroend

!macro customPageAfterChangeDir
  Page custom OrbitOptionsPage OrbitOptionsLeave
!macroend

!ifndef BUILD_UNINSTALLER
Function OrbitOptionsPage
  !insertmacro MUI_HEADER_TEXT "Настройка Orbit AI" "Выберите ярлыки приложения"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 35u "Все необходимые компоненты Electron уже включены. Node.js и Python на компьютере пользователя не требуются."
  Pop $0
  ${NSD_CreateCheckbox} 0 48u 100% 14u "Создать ярлык на рабочем столе"
  Pop $OrbitDesktopCheck
  ${NSD_SetState} $OrbitDesktopCheck $OrbitDesktopState
  ${NSD_CreateCheckbox} 0 72u 100% 14u "Создать ярлык в меню Пуск"
  Pop $OrbitMenuCheck
  ${NSD_SetState} $OrbitMenuCheck $OrbitMenuState
  ${NSD_CreateLabel} 0 106u 100% 42u "Chrome устанавливается отдельно с официального сайта Google. Доступ к файлам, экрану, микрофону и командам выключен по умолчанию. Автозапуск не добавляется."
  Pop $0
  nsDialogs::Show
FunctionEnd

Function OrbitOptionsLeave
  ${NSD_GetState} $OrbitDesktopCheck $OrbitDesktopState
  ${NSD_GetState} $OrbitMenuCheck $OrbitMenuState
FunctionEnd
!endif

!macro customInstall
  ${If} $OrbitDesktopState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\Orbit AI.lnk" "$INSTDIR\Orbit AI.exe"
  ${EndIf}
  ${If} $OrbitMenuState == ${BST_CHECKED}
    CreateShortCut "$SMPROGRAMS\Orbit AI.lnk" "$INSTDIR\Orbit AI.exe"
  ${EndIf}
!macroend

!macro customUnInstall
  Delete "$DESKTOP\Orbit AI.lnk"
  Delete "$SMPROGRAMS\Orbit AI.lnk"
!macroend
