#!/bin/bash

set -u

legacy_executable='codex-linux-community'
legacy_binary='/opt/Codex Linux Community/codex-linux-community'
legacy_desktop='/usr/share/applications/community.codexlinux.desktop'

# A renamed package can leave the old alternative behind when a previous
# installation was interrupted. Remove it only when its registered target is
# the binary shipped by the former package.
if type update-alternatives >/dev/null 2>&1; then
    if update-alternatives --query "$legacy_executable" 2>/dev/null \
        | grep -Fqx "Alternative: $legacy_binary"; then
        update-alternatives --remove "$legacy_executable" "$legacy_binary" || true
    fi
elif [ -L "/usr/bin/$legacy_executable" ] \
    && [ "$(readlink "/usr/bin/$legacy_executable")" = "$legacy_binary" ]; then
    rm -f "/usr/bin/$legacy_executable"
fi

# Normally dpkg removes this file while replacing codex-linux-community. A
# failed historical uninstall can leave it orphaned, so clean it only when the
# file positively identifies both the old display name and executable.
if [ -f "$legacy_desktop" ] \
    && grep -Fqx 'Name=Codex Linux Community' "$legacy_desktop" \
    && grep -Fqx 'Exec="/opt/Codex Linux Community/codex-linux-community" %U' "$legacy_desktop"; then
    rm -f "$legacy_desktop"
fi

if type update-alternatives >/dev/null 2>&1; then
    # Remove a non-alternatives link only when it resolves to this package.
    if [ -L '/usr/bin/${executable}' ] \
        && [ "$(readlink '/usr/bin/${executable}')" != '/etc/alternatives/${executable}' ] \
        && [ "$(readlink '/usr/bin/${executable}')" = '/opt/${sanitizedProductName}/${executable}' ]; then
        rm -f '/usr/bin/${executable}'
    fi
    update-alternatives --install '/usr/bin/${executable}' '${executable}' '/opt/${sanitizedProductName}/${executable}' 100 \
        || ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
else
    ln -sf '/opt/${sanitizedProductName}/${executable}' '/usr/bin/${executable}'
fi

# Check whether user namespaces are supported by the kernel and working.
if ! { [[ -L /proc/self/ns/user ]] && unshare --user true; }; then
    chmod 4755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
else
    chmod 0755 '/opt/${sanitizedProductName}/chrome-sandbox' || true
fi

if hash update-mime-database 2>/dev/null; then
    update-mime-database /usr/share/mime || true
fi

if hash update-desktop-database 2>/dev/null; then
    update-desktop-database /usr/share/applications || true
fi

# Install the AppArmor profile when the host supports the bundled ABI.
if apparmor_status --enabled > /dev/null 2>&1; then
    APPARMOR_PROFILE_SOURCE='/opt/${sanitizedProductName}/resources/apparmor-profile'
    APPARMOR_PROFILE_TARGET='/etc/apparmor.d/${executable}'
    if apparmor_parser --skip-kernel-load --debug "$APPARMOR_PROFILE_SOURCE" > /dev/null 2>&1; then
        cp -f "$APPARMOR_PROFILE_SOURCE" "$APPARMOR_PROFILE_TARGET"
        if ! { [ -x '/usr/bin/ischroot' ] && /usr/bin/ischroot; } \
            && hash apparmor_parser 2>/dev/null; then
            apparmor_parser --replace --write-cache --skip-read-cache "$APPARMOR_PROFILE_TARGET"
        fi
    else
        echo 'Skipping AppArmor profile installation because the host does not support its ABI'
    fi
fi
