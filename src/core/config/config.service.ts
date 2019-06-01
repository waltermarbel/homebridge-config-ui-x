import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as crypto from 'crypto';
import * as semver from 'semver';

export interface HomebridgeConfig {
  bridge: {
    username: string;
    pin: string;
    name: string;
    port: number;
  };
  platforms: any[];
  accessories: any[];
  plugins?: string;
}

@Injectable()
export class ConfigService {
  public name = 'homebridge-config-ui-x';

  // server env
  public minimumNodeVersion = '8.15.1';
  public runningInDocker = Boolean(process.env.HOMEBRIDGE_CONFIG_UI === '1');
  public runningInLinux = (!this.runningInDocker && os.platform() === 'linux');
  public ableToConfigureSelf = (!this.runningInDocker || semver.satisfies(process.env.CONFIG_UI_VERSION, '>=3.5.5'), { includePrerelease: true });
  public enableTerminalAccess = this.runningInDocker || Boolean(process.env.HOMEBRIDGE_CONFIG_UI_TERMINAL === '1');
  public branding = process.env.CONFIG_UI_BRANDING || false;

  // homebridge env
  public configPath: string;
  public storagePath: string;
  public customPluginPath: string;
  public secretPath: string;
  public authPath: string;
  public accessoryLayoutPath: string;
  public homebridgeInsecureMode: boolean;
  public homebridgeNoTimestamps: boolean;

  // docker paths
  public startupScript: string;
  public dockerEnvFile: string;

  // package.json
  public package = fs.readJsonSync(path.resolve(process.env.UIX_BASE_PATH, 'package.json'));

  public homebridgeConfig: HomebridgeConfig;

  public ui: {
    name: string;
    port: number;
    host?: '::' | '0.0.0.0' | string;
    auth: 'form' | 'none';
    theme: string;
    sudo?: boolean;
    restart?: string;
    log?: {
      method: 'file' | 'custom' | 'systemd';
      command?: string;
      path?: string;
      service?: string;
    };
    ssl?: {
      key?: string;
      cert?: string;
      pfx?: string;
      passphrase?: string;
    };
    temp?: string;
    tempUnits?: string;
    loginWallpaper?: string;
    noFork?: boolean;
    linux?: {
      shutdown?: string;
      restart?: string;
    };
    debug?: boolean;
    proxyHost?: string;
    sessionTimeout?: number;
    websocketCompatibilityMode?: boolean;
    homebridgePackagePath?: string;
  };

  public secrets: {
    secretKey: string;
  };

  public instanceId: string;

  // multimode settings - mode these
  public multimodeInstance: string;
  public multimodeStoragePath: string;
  public multimodeConfigPath: string;

  public multimodeConfig: {
    port?: number;
    host?: '::' | '0.0.0.0' | string;
    auth: 'form' | 'none';
    ssl?: {
      key?: string;
      cert?: string;
      pfx?: string;
      passphrase?: string;
    };
    proxyHost?: string;
    debug?: boolean;
    instances: {
      name: string;
      path: string;
      insecure?: boolean;
      noTimstamps?: boolean;
      customPluginPath?: string;
    }[];
  };

  constructor() {
    if (process.env.UIX_MULTIMODE) {
      this.multimodeStoragePath = path.resolve(process.env.UIX_MULTIMODE);
      this.multimodeConfigPath = path.resolve(this.multimodeStoragePath, 'ui.json');
      this.getMultimodeConfig();
    }

    this.reloadConfig();

    if (this.runningInDocker) {
      this.setConfigForDocker();
    }

    if (!this.ui.port) {
      this.ui.port = 8080;
    }

    if (!this.ui.sessionTimeout) {
      this.ui.sessionTimeout = 28800;
    }

    this.secrets = this.getSecrets();
    this.instanceId = this.getInstanceId();
  }

  /** Load the config */
  public reloadConfig() {
    if (this.multimodeInstance) {
      this.setMultimodeInstance(this.multimodeInstance);
    } else {
      this.configPath = process.env.UIX_CONFIG_PATH || path.resolve(os.homedir(), '.homebridge/config.json');
      this.storagePath = process.env.UIX_STORAGE_PATH || path.resolve(os.homedir(), '.homebridge');
      this.secretPath = path.resolve(this.storagePath, '.uix-secrets');
      this.authPath = path.resolve(this.storagePath, 'auth.json');
      this.customPluginPath = process.env.UIX_CUSTOM_PLUGIN_PATH;
      this.homebridgeInsecureMode = Boolean(process.env.UIX_INSECURE_MODE);
      this.homebridgeNoTimestamps = Boolean(process.env.UIX_LOG_NO_TIMESTAMPS);
    }

    this.accessoryLayoutPath = path.resolve(this.storagePath, 'accessories', 'uiAccessoriesLayout.json');

    // docker paths
    this.startupScript = path.resolve(this.storagePath, 'startup.sh');
    this.dockerEnvFile = path.resolve(this.storagePath, '.docker.env');

    this.homebridgeConfig = fs.readJSONSync(this.configPath);
    this.ui = Array.isArray(this.homebridgeConfig.platforms) ? this.homebridgeConfig.platforms.find(x => x.platform === 'config') : undefined;

    if (!this.ui) {
      this.ui = {
        name: 'Config',
      } as any;
    }

    if (this.multimodeInstance) {
      this.ui.port = this.multimodeConfig.port || 8080;
      this.ui.auth = this.multimodeConfig.auth || 'form';
      this.ui.host = this.multimodeConfig.host;
      this.ui.debug = this.multimodeConfig.debug;
      this.ui.proxyHost = this.multimodeConfig.proxyHost;
      this.ui.ssl = this.multimodeConfig.ssl;
    }

    process.env.UIX_PLUGIN_NAME = this.ui.name || 'homebridge-config-ui-x';
  }

  /**
   * Settings that are sent to the UI
   */
  public uiSettings() {
    return {
      env: {
        ableToConfigureSelf: this.ableToConfigureSelf,
        enableAccessories: this.homebridgeInsecureMode,
        enableTerminalAccess: this.enableTerminalAccess,
        homebridgeInstanceName: this.homebridgeConfig.bridge.name,
        nodeVersion: process.version,
        packageName: this.package.name,
        packageVersion: this.package.version,
        runningInDocker: this.runningInDocker,
        runningInLinux: this.runningInLinux,
        temperatureUnits: this.ui.tempUnits || 'c',
        websocketCompatibilityMode: this.ui.websocketCompatibilityMode || false,
        branding: this.branding,
        instanceId: this.instanceId,
        multimodeInstance: this.multimodeInstance,
      },
      formAuth: Boolean(this.ui.auth !== 'none'),
      theme: this.ui.theme || 'teal',
      serverTimestamp: new Date().toISOString(),
    };
  }

  /**
   * Change to a different multimode instance
   */
  public changeInstance(instanceName: string) {
    this.multimodeInstance = instanceName;
    this.reloadConfig();
  }

  /**
   * Populate the config for a multimode setup
   */
  private getMultimodeConfig() {
    this.multimodeConfig = fs.readJsonSync(this.multimodeConfigPath);
    this.multimodeInstance = this.multimodeConfig.instances[0].name;
  }

  /**
   * Set the multimode config for the current instance
   * @param instanceName
   */
  private setMultimodeInstance(instanceName: string) {
    const config = this.multimodeConfig.instances.find(x => x.name === instanceName);

    if (!config) {
      throw new Error(`Could not find instance with name ${instanceName}`);
    }

    this.multimodeInstance = config.name;
    this.configPath = path.resolve(config.path, 'config.json');
    this.storagePath = path.resolve(config.path);
    this.customPluginPath = config.customPluginPath ? path.resolve(config.customPluginPath) : undefined;
    this.secretPath = path.resolve(this.multimodeStoragePath, '.uix-secrets');
    this.authPath = path.resolve(this.multimodeStoragePath, 'auth.json');
    this.homebridgeInsecureMode = config.insecure;
    this.homebridgeNoTimestamps = config.noTimstamps;
  }

  /**
   * Populate the required config for oznu/homebridge docker
   */
  private setConfigForDocker() {
    // forced config
    this.ui.restart = 'killall -9 homebridge && killall -9 homebridge-config-ui-x';
    this.homebridgeInsecureMode = Boolean(process.env.HOMEBRIDGE_INSECURE === '1');
    this.ui.sudo = false;
    this.ui.log = {
      method: 'file',
      path: '/homebridge/logs/homebridge.log',
    };

    // these options can be overridden using the config.json file
    if (!this.ui.port && process.env.HOMEBRIDGE_CONFIG_UI_PORT) {
      this.ui.port = parseInt(process.env.HOMEBRIDGE_CONFIG_UI_PORT, 10);
    }
    this.ui.theme = this.ui.theme || process.env.HOMEBRIDGE_CONFIG_UI_THEME || 'teal';
    this.ui.auth = this.ui.auth || process.env.HOMEBRIDGE_CONFIG_UI_AUTH as 'form' | 'none' || 'form';
    this.ui.temp = this.ui.temp || process.env.HOMEBRIDGE_CONFIG_UI_TEMP || undefined;
    this.ui.loginWallpaper = this.ui.loginWallpaper || process.env.HOMEBRIDGE_CONFIG_UI_LOGIN_WALLPAPER || undefined;
  }

  /**
   * Gets the unique secrets for signing JWTs
   */
  private getSecrets() {
    if (fs.pathExistsSync(this.secretPath)) {
      try {
        const secrets = fs.readJsonSync(this.secretPath);
        if (!secrets.secretKey) {
          return this.generateSecretToken();
        } else {
          return secrets;
        }
      } catch (e) {
        return this.generateSecretToken();
      }
    } else {
      return this.generateSecretToken();
    }
  }

  /**
   * Generates the secret token for signing JWTs
   */
  private generateSecretToken() {
    const secrets = {
      secretKey: crypto.randomBytes(32).toString('hex'),
    };

    fs.writeJsonSync(this.secretPath, secrets);

    return secrets;
  }

  /**
   * Generates a public instance id from a sha256 has of the secret key
   */
  private getInstanceId(): string {
    return crypto.createHash('sha256').update(this.secrets.secretKey).digest('hex');
  }

}
