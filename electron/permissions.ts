import { systemPreferences } from 'electron';
import os from 'node:os';
import type { PermissionStatus } from '../shared/types';

export interface PermissionDetails {
  platform: NodeJS.Platform;
  accessibilityTrusted: boolean;
  screenRecordingStatus: string;
  screenRecordingTrusted: boolean;
  relaunchRecommended: boolean;
  hints: string[];
}

export function checkPermissions(): PermissionStatus {
    const isMac = os.platform() === 'darwin';

    if (!isMac) {
        // Windows permissions are generally handled differently, often not requiring explicit prompts for basic desktop capture via Electron.
        // For now, assume true on Windows until specific hook issues arise.
        return {
            accessibility: true,
            screenRecording: true,
        };
    }

    // Check Accessibility status (prompts if not given when prompt=true)
    const accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(false);

    // Check Screen Recording status
    const screenRecordingStatus = systemPreferences.getMediaAccessStatus('screen');
    const screenRecordingTrusted = screenRecordingStatus === 'granted';

    return {
        accessibility: accessibilityTrusted,
        screenRecording: screenRecordingTrusted,
    };
}

export function requestAccessibility() {
    if (os.platform() === 'darwin') {
        systemPreferences.isTrustedAccessibilityClient(true);
    }
}

export function getPermissionDetails(): PermissionDetails {
  const platform = os.platform();
  if (platform !== 'darwin') {
    return {
      platform,
      accessibilityTrusted: true,
      screenRecordingStatus: 'granted',
      screenRecordingTrusted: true,
      relaunchRecommended: false,
      hints: ['Windows permission checks are handled differently and do not use macOS privacy panes.'],
    };
  }

  const accessibilityTrusted = systemPreferences.isTrustedAccessibilityClient(false);
  const screenRecordingStatus = systemPreferences.getMediaAccessStatus('screen');
  const screenRecordingTrusted = screenRecordingStatus === 'granted';
  const relaunchRecommended = !accessibilityTrusted || !screenRecordingTrusted;

  const hints: string[] = [];
  if (!accessibilityTrusted) {
    hints.push('Enable StepCanvas under Privacy & Security > Accessibility.');
  }
  if (!screenRecordingTrusted) {
    hints.push('Enable StepCanvas under Privacy & Security > Screen & System Audio Recording.');
  }
  if (relaunchRecommended) {
    hints.push('After changing either permission, fully quit and reopen StepCanvas.');
  }

  return {
    platform,
    accessibilityTrusted,
    screenRecordingStatus,
    screenRecordingTrusted,
    relaunchRecommended,
    hints,
  };
}

export function permissionDiagnostics(): string {
  const details = getPermissionDetails();
  return [
    `platform=${details.platform}`,
    `accessibility=${details.accessibilityTrusted}`,
    `screenRecordingStatus=${details.screenRecordingStatus}`,
    `screenRecordingTrusted=${details.screenRecordingTrusted}`,
  ].join(' ');
}
