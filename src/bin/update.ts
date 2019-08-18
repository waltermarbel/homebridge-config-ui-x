import * as child_process from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

const packageWhitelist = [
  'homebridge-hue',
  'homebridge-config-ui-x',
  'homebridge',
];

async function bootstrap() {
  const pkg = packageWhitelist.find(x => x === process.env.UIX_OFFLINE_UPDATE_PACKAGE);
  const storagePath = process.env.UIX_OFFLINE_UPDATE_STORAGE_PATH;

  if (!pkg) {
    process.exit(1);
  }

  // create a log file
  const log = fs.createWriteStream(process.env.UIX_OFFLINE_UPDATE_LOG);
  process.stdout.write = process.stderr.write = log.write.bind(log);

  // build the update command
  const npm = getNpmPath();
  const command = [...npm, 'install', '-g', '--unsafe-perm', pkg];

  // run the update command
  log.write(`Running update command: ${command.join(' ')}`);
  const update = child_process.spawn(command.shift(), command);

  update.stdout.on('data', (data) => {
    log.write(data);
  });

  update.stderr.on('data', (data) => {
    log.write(data);
  });

  update.on('close', () => {
    // we really want to make sure the lock file is deleted
    fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_LOCKFILE);
    fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_SELF);
    process.exit(0);
  });
}

function getNpmPath() {
  if (os.platform() === 'win32') {
    // if running on windows find the full path to npm
    const windowsNpmPath = [
      path.join(process.env.APPDATA, 'npm/npm.cmd'),
      path.join(process.env.ProgramFiles, 'nodejs/npm.cmd'),
    ].filter(fs.existsSync);

    if (windowsNpmPath.length) {
      return [windowsNpmPath[0], '--no-update-notifier'];
    } else {
      this.logger.error(`ERROR: Cannot find npm binary. You will not be able to manage plugins or update homebridge.`);
      this.logger.error(`ERROR: You might be able to fix this problem by running: npm install -g npm`);
    }
  }
  // Linux and macOS don't require the full path to npm
  return ['npm', '--no-update-notifier'];
}

try {
  bootstrap();
} catch (e) {
  // we really want to make sure the lock file is deleted
  fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_LOCKFILE);
  fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_SELF);
  process.exit(1);
}

process.once('beforeExit', (code) => {
  // we really want to make sure the lock file is deleted
  fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_LOCKFILE);
  fs.unlinkSync(process.env.UIX_OFFLINE_UPDATE_SELF);
  process.exit(code);
});