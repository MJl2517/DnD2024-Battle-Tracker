!macro removeDnDTrackerUserData
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}

  RMDir /r "$APPDATA\${APP_FILENAME}"

  !ifdef APP_PRODUCT_FILENAME
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
  !endif

  !ifdef APP_PACKAGE_NAME
    RMDir /r "$APPDATA\${APP_PACKAGE_NAME}"
  !endif

  ${if} $installMode == "all"
    SetShellVarContext all
  ${endif}
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    ${ifNot} ${Silent}
      ClearErrors
      ${GetParameters} $R0
      ${GetOptions} $R0 "--delete-app-data" $R1

      ${if} ${Errors}
        MessageBox MB_YESNO|MB_ICONQUESTION "Удалить локальные данные DnD 2024 Battle Tracker?$\r$\n$\r$\nБудут удалены кампании, энкаунтеры, игроки, импортированные NPC и локальная SQLite-база." IDYES deleteUserData IDNO keepUserData
        Goto keepUserData

        deleteUserData:
          !insertmacro removeDnDTrackerUserData

        keepUserData:
      ${endif}
    ${endif}
  ${endif}
!macroend
