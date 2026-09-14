// src/utils/logger.ts
class Logger {
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    debug(message, ...args) {
        if (this.verbose) {
            console.debug(`[BusyTeX Debug] ${message}`, ...args);
        }
    }
    info(message, ...args) {
        console.info(`[BusyTeX] ${message}`, ...args);
    }
    warn(message, ...args) {
        console.warn(`[BusyTeX Warning] ${message}`, ...args);
    }
    error(message, ...args) {
        console.error(`[BusyTeX Error] ${message}`, ...args);
    }
}

// src/utils/error-handling.ts
class ErrorHandler {
    static handle(error, context) {
        const message = this.getMessage(error);
        const fullMessage = context ? `${context}: ${message}` : message;
        return new Error(fullMessage);
    }
    static getMessage(error) {
        if (error instanceof Error) {
            return error.message;
        }
        return String(error);
    }
}

const PACKAGE_VERSION = '1.4';

// src/core/package-cache.ts
const EM_CACHE_DB = 'EM_PRELOAD_CACHE';
const PACKAGES_STORE = 'PACKAGES';
const METADATA_STORE = 'METADATA';
const CACHE_VERSION_KEY = 'texlyre-busytex-version';
function dataFileName(packageJsUrl) {
    const name = packageJsUrl.split('/').pop() || '';
    return name.replace(/\.js$/, '.data');
}
async function ensureCacheVersion() {
    if (typeof localStorage === 'undefined')
        return;
    if (localStorage.getItem(CACHE_VERSION_KEY) === PACKAGE_VERSION)
        return;
    await clearAllPackageCache();
    localStorage.setItem(CACHE_VERSION_KEY, PACKAGE_VERSION);
}
async function openEmCache() {
    await ensureCacheVersion();
    return new Promise(resolve => {
        if (typeof indexedDB === 'undefined')
            return resolve(null);
        const request = indexedDB.open(EM_CACHE_DB);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onupgradeneeded = () => {
            try {
                request.transaction?.abort();
            }
            catch { }
            resolve(null);
        };
    });
}
async function findMetadataKey(db, dataFile) {
    if (!db.objectStoreNames.contains(METADATA_STORE))
        return null;
    return await new Promise(resolve => {
        const tx = db.transaction(METADATA_STORE, 'readonly');
        const req = tx.objectStore(METADATA_STORE).getAllKeys();
        req.onsuccess = () => {
            const keys = req.result;
            const match = keys.find(k => String(k).endsWith(`/${dataFile}`));
            resolve(match ?? null);
        };
        req.onerror = () => resolve(null);
    });
}
async function isPackageCached(packageJsUrl) {
    const db = await openEmCache();
    if (!db)
        return false;
    try {
        const key = await findMetadataKey(db, dataFileName(packageJsUrl));
        return key !== null;
    }
    finally {
        db.close();
    }
}
async function deletePackageCache(packageJsUrl) {
    const db = await openEmCache();
    if (!db)
        return;
    const dataFile = dataFileName(packageJsUrl);
    try {
        const metadataKey = await findMetadataKey(db, dataFile);
        if (!metadataKey)
            return;
        const stores = [METADATA_STORE];
        if (db.objectStoreNames.contains(PACKAGES_STORE))
            stores.push(PACKAGES_STORE);
        await new Promise(resolve => {
            const tx = db.transaction(stores, 'readwrite');
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
            tx.onabort = () => resolve();
            tx.objectStore(METADATA_STORE).delete(metadataKey);
            if (stores.includes(PACKAGES_STORE)) {
                const pkgPrefix = String(metadataKey).replace(/^metadata\//, 'package/');
                const store = tx.objectStore(PACKAGES_STORE);
                const cursorReq = store.openKeyCursor();
                cursorReq.onsuccess = () => {
                    const cursor = cursorReq.result;
                    if (!cursor)
                        return;
                    const k = String(cursor.key);
                    if (k.startsWith(pkgPrefix + '/'))
                        store.delete(cursor.key);
                    cursor.continue();
                };
            }
        });
    }
    finally {
        db.close();
    }
}
async function clearAllPackageCache() {
    if (typeof indexedDB === 'undefined')
        return;
    await new Promise(resolve => {
        const req = indexedDB.deleteDatabase(EM_CACHE_DB);
        req.onsuccess = () => resolve();
        req.onerror = () => resolve();
        req.onblocked = () => resolve();
    });
}

// src/core/busytex-runner.ts
const DOWNLOAD_PROGRESS_PATTERN = /^(?:Preparing|Downloading data)\.\.\. \((\d+)\/(\d+)\)$/;
function parseDownloadProgress(message) {
    if (message === 'All downloads complete.')
        return { loaded: 1, total: 1, percent: 100 };
    const match = DOWNLOAD_PROGRESS_PATTERN.exec(message);
    if (!match)
        return null;
    const loaded = Number(match[1]);
    const total = Number(match[2]);
    return { loaded, total, percent: total > 0 ? Math.round((loaded / total) * 100) : 0 };
}
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
class BusyTexRunner {
    constructor(config = {}) {
        this.initialized = false;
        this.worker = null;
        this.busytexPipeline = null;
        this.config = {
            busytexBasePath: config.busytexBasePath || '/core/busytex',
            verbose: config.verbose ?? false,
            engineMode: config.engineMode ?? 'combined',
            preloadDataPackages: config.preloadDataPackages ?? [],
            catalogDataPackages: config.catalogDataPackages ?? [],
            initRetries: config.initRetries ?? 2,
            initRetryDelayMs: config.initRetryDelayMs ?? 1500,
            onDownloadProgress: config.onDownloadProgress ?? (() => { })
        };
        this.logger = new Logger(this.config.verbose);
    }
    async initialize(useWorker = true) {
        if (this.initialized)
            return;
        await ensureCacheVersion();
        this.logger.info('Initializing BusyTeX...');
        const maxAttempts = this.config.initRetries + 1;
        let lastError;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                if (useWorker) {
                    await this.initializeWorker();
                }
                else {
                    await this.initializeDirect();
                }
                this.initialized = true;
                this.logger.info('BusyTeX initialized successfully');
                return;
            }
            catch (error) {
                lastError = error;
                this.terminate();
                if (attempt === maxAttempts)
                    break;
                await this.clearPreloadDataPackageCache();
                this.logger.debug(`BusyTeX initialization attempt ${attempt} failed, retrying...`, error);
                await delay(this.config.initRetryDelayMs * attempt);
            }
        }
        throw ErrorHandler.handle(lastError, 'Failed to initialize BusyTeX');
    }
    async clearPreloadDataPackageCache() {
        for (const packageUrl of this.config.preloadDataPackages) {
            try {
                await deletePackageCache(packageUrl);
            }
            catch (error) {
                this.logger.debug(`Failed to clear preload data package cache for ${packageUrl}`, error);
            }
        }
    }
    async initializeWorker() {
        return new Promise((resolve, reject) => {
            const workerPath = `${this.config.busytexBasePath}/busytex_worker.js`;
            this.worker = new Worker(workerPath);
            let settled = false;
            let timeout;
            const settle = (callback) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timeout);
                callback();
            };
            const resetTimeout = () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    settle(() => reject(new Error('Timeout waiting for BusyTeX worker to initialize')));
                }, 120000);
            };
            resetTimeout();
            this.worker.onmessage = ({ data }) => {
                if (settled)
                    return;
                if (data.initialized) {
                    settle(() => {
                        this.logger.debug('BusyTeX worker initialized:', data.initialized);
                        resolve();
                    });
                }
                else if (data.exception) {
                    settle(() => reject(new Error(data.exception)));
                }
                else if (data.print) {
                    if (this.reportDownloadProgress(data.print))
                        resetTimeout();
                }
            };
            this.worker.onerror = (error) => {
                error.preventDefault();
                settle(() => reject(new Error('BusyTeX worker failed to initialize')));
            };
            const { jsFile, wasmFile } = this.getEngineAssetNames();
            const busytexJs = `${this.config.busytexBasePath}/${jsFile}`;
            const busytexWasm = `${this.config.busytexBasePath}/${wasmFile}`;
            const { biberJs, biberWasm, biberData } = this.getBiberAssetPaths();
            this.worker.postMessage({
                busytex_js: busytexJs,
                busytex_wasm: busytexWasm,
                biber_js: biberJs,
                biber_wasm: biberWasm,
                biber_data: biberData,
                preload_data_packages_js: this.config.preloadDataPackages,
                data_packages_js: this.config.catalogDataPackages,
                texmf_local: [],
                preload: true
            });
        });
    }
    async initializeDirect() {
        const scripts = [
            `${this.config.busytexBasePath}/busytex_biber.js`,
            `${this.config.busytexBasePath}/busytex_pipeline.js`
        ];
        for (const src of scripts) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }
        const BusytexPipeline = window.BusytexPipeline;
        const { jsFile, wasmFile } = this.getEngineAssetNames();
        const busytexJs = `${this.config.busytexBasePath}/${jsFile}`;
        const busytexWasm = `${this.config.busytexBasePath}/${wasmFile}`;
        const { biberJs, biberWasm, biberData } = this.getBiberAssetPaths();
        this.busytexPipeline = new BusytexPipeline(busytexJs, busytexWasm, this.config.preloadDataPackages, this.config.catalogDataPackages, [], (msg) => { this.logger.debug(msg); this.reportDownloadProgress(msg); }, (versions) => this.logger.debug('Applet versions:', versions), true, BusytexPipeline.ScriptLoaderDocument, biberJs, biberWasm, biberData);
        await this.busytexPipeline.on_initialized_promise;
    }
    reportDownloadProgress(message) {
        const progress = parseDownloadProgress(message);
        if (progress)
            this.config.onDownloadProgress(progress);
        return progress;
    }
    getBiberAssetPaths() {
        const base = this.config.busytexBasePath;
        return { biberJs: `${base}/biber.js`, biberWasm: `${base}/biber.wasm`, biberData: `${base}/biber.data` };
    }
    getEngineAssetNames() {
        const mode = this.config.engineMode;
        if (mode === 'combined') {
            return { jsFile: 'busytex.js', wasmFile: 'busytex.wasm' };
        }
        return { jsFile: `${mode}.js`, wasmFile: `${mode}.wasm` };
    }
    convertFilesToBusyTexFormat(files) {
        return files.map(f => ({
            path: f.path,
            contents: f.content
        }));
    }
    async compile(files, mainTexPath, bibtex = null, biber = null, makeindex = null, rerun = null, verbose = 'silent', driver = 'xetex_bibtex8_dvipdfmx', dataPackagesJs = null, remoteEndpoint, shellEscape = false, shellHandlerScripts = []) {
        if (!this.initialized) {
            throw new Error('BusyTeX not initialized. Call initialize() first.');
        }
        this.logger.info(`Compiling ${mainTexPath}...`);
        const busytexFiles = this.convertFilesToBusyTexFormat(files);
        if (this.worker) {
            return this.compileWithWorker(busytexFiles, mainTexPath, bibtex, biber, makeindex, rerun, verbose, driver, dataPackagesJs, remoteEndpoint, shellEscape, shellHandlerScripts);
        }
        else {
            return this.compileDirect(busytexFiles, mainTexPath, bibtex, biber, makeindex, rerun, verbose, driver, dataPackagesJs, remoteEndpoint, shellEscape);
        }
    }
    async compileWithWorker(files, mainTexPath, bibtex, biber, makeindex = null, rerun = null, verbose, driver, dataPackagesJs, remoteEndpoint, shellEscape = false, shellHandlerScripts = []) {
        return new Promise((resolve, reject) => {
            if (!this.worker) {
                reject(new Error('Worker not initialized'));
                return;
            }
            const timeout = setTimeout(() => {
                reject(new Error('Compilation timeout'));
            }, 180000);
            const startCompile = () => {
                this.worker.postMessage({
                    files,
                    main_tex_path: mainTexPath,
                    bibtex,
                    biber,
                    verbose,
                    driver,
                    data_packages_js: dataPackagesJs,
                    remote_endpoint: remoteEndpoint,
                    makeindex,
                    rerun,
                    shell_escape: shellEscape
                });
            };
            let loadedHandlerScripts = 0;
            const expectedHandlerScripts = shellHandlerScripts.length;
            this.worker.onmessage = ({ data }) => {
                if (data.print) {
                    this.logger.debug(data.print);
                    this.reportDownloadProgress(data.print);
                }
                else if (data.shell_handler_script_loaded !== undefined) {
                    loadedHandlerScripts++;
                    if (loadedHandlerScripts === expectedHandlerScripts) {
                        startCompile();
                    }
                }
                else if (data.pdf !== undefined) {
                    clearTimeout(timeout);
                    resolve({
                        success: data.exit_code === 0,
                        pdf: data.pdf,
                        synctex: data.synctex,
                        log: data.log,
                        exitCode: data.exit_code,
                        logs: data.logs
                    });
                }
                else if (data.exception) {
                    clearTimeout(timeout);
                    reject(new Error(data.exception));
                }
            };
            if (expectedHandlerScripts > 0) {
                for (const script of shellHandlerScripts) {
                    this.worker.postMessage({ load_shell_handler_script: script });
                }
            }
            else {
                startCompile();
            }
        });
    }
    async compileDirect(files, mainTexPath, bibtex, biber, makeindex = null, rerun = null, verbose, driver, dataPackagesJs, remoteEndpoint, shellEscape = false) {
        const result = await this.busytexPipeline.compile(files, mainTexPath, bibtex, biber, makeindex, rerun, verbose, driver, dataPackagesJs, remoteEndpoint, shellEscape);
        return {
            success: result.exit_code === 0,
            pdf: result.pdf,
            synctex: result.synctex,
            log: result.log,
            exitCode: result.exit_code,
            logs: result.logs
        };
    }
    async readProjectFiles(dir) {
        if (this.worker) {
            return new Promise((resolve, reject) => {
                this.worker.onmessage = ({ data }) => {
                    if (data.project_files !== undefined)
                        resolve(data.project_files.map((f) => ({ path: f.path, content: f.contents })));
                    else if (data.exception)
                        reject(new Error(data.exception));
                };
                this.worker.postMessage({ read_project_files: dir ? { dir } : true });
            });
        }
        const files = await this.busytexPipeline.read_project_files(dir ?? null);
        return files.map((f) => ({ path: f.path, content: f.contents }));
    }
    async writeTexliveRemoteFiles(files) {
        const payload = files.map(f => ({ name: f.name, format: f.format, contents: f.content }));
        if (this.worker) {
            return new Promise((resolve, reject) => {
                this.worker.onmessage = ({ data }) => {
                    if (data.texlive_remote_written)
                        resolve();
                    else if (data.exception)
                        reject(new Error(data.exception));
                };
                this.worker.postMessage({ write_texlive_remote_files: payload });
            });
        }
        await this.busytexPipeline.write_texlive_remote_files(payload);
    }
    async writeTexliveRemoteMisses(keys) {
        if (this.worker) {
            return new Promise((resolve, reject) => {
                this.worker.onmessage = ({ data }) => {
                    if (data.texlive_remote_misses_written)
                        resolve();
                    else if (data.exception)
                        reject(new Error(data.exception));
                };
                this.worker.postMessage({ write_texlive_remote_misses: keys });
            });
        }
        await this.busytexPipeline.write_texlive_remote_misses(keys);
    }
    async isPackageCached(packageJsUrl) {
        return isPackageCached(packageJsUrl);
    }
    async deletePackageCache(packageJsUrl) {
        await deletePackageCache(packageJsUrl);
        if (this.initialized)
            this.terminate();
    }
    async clearAllPackageCache() {
        await clearAllPackageCache();
        if (this.initialized)
            this.terminate();
    }
    terminate() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        if (this.busytexPipeline) {
            this.busytexPipeline.terminate();
            this.busytexPipeline = null;
        }
        this.initialized = false;
        this.logger.info('BusyTeX terminated');
    }
    isInitialized() {
        return this.initialized;
    }
    getConfig() {
        return { ...this.config };
    }
}

class BaseTool {
    constructor(runner, verbose = false) {
        this.runner = runner;
        this.logger = new Logger(verbose);
    }
    async compile(options) {
        if (!this.runner.isInitialized()) {
            await this.runner.initialize();
        }
        const config = this.runner.getConfig();
        const driver = options.driver ?? this.getDriver();
        if (config.engineMode !== 'combined') {
            const driverEngineMap = {
                'pdftex_bibtex8': 'pdftex',
                'xetex_bibtex8_dvipdfmx': 'xetex',
                'luahbtex_bibtex8': 'luahbtex',
                'luatex_bibtex8': 'luahbtex'
            };
            const requiredEngine = driverEngineMap[driver];
            if (requiredEngine && requiredEngine !== config.engineMode) {
                return {
                    success: false,
                    log: `Engine mismatch: driver "${driver}" requires "${requiredEngine}" but runner is configured with "${config.engineMode}". Use engineMode: "combined" or the matching engine.`,
                    exitCode: 1,
                    logs: []
                };
            }
        }
        const mainTexPath = this.getMainTexPath(options);
        const files = this.prepareFiles(options, mainTexPath);
        return this.runner.compile(files, mainTexPath, options.bibtex ?? null, options.biber ?? null, options.makeindex ?? null, options.rerun ?? null, options.verbose ?? 'silent', driver, options.dataPackagesJs ?? null, options.remoteEndpoint, options.shellEscape ?? false, options.shellHandlerScripts ?? []);
    }
    getMainTexPath(options) {
        return options.mainTexPath ?? 'main.tex';
    }
    prepareFiles(options, mainTexPath) {
        const files = [];
        files.push({ path: mainTexPath, content: options.input });
        if (options.additionalFiles) {
            files.push(...options.additionalFiles);
        }
        return files;
    }
}

class PdfLatex extends BaseTool {
    getDriver() {
        return 'pdftex_bibtex8';
    }
    async compile(options) {
        return super.compile({ ...options, driver: this.getDriver() });
    }
}

class XeLatex extends BaseTool {
    getDriver() {
        return 'xetex_bibtex8_dvipdfmx';
    }
    async compile(options) {
        return super.compile({ ...options, driver: this.getDriver() });
    }
}

class LuaLatex extends BaseTool {
    getDriver() {
        return 'luahbtex_bibtex8';
    }
    async compile(options) {
        return super.compile({ ...options, driver: this.getDriver() });
    }
}

export { BusyTexRunner, Logger, LuaLatex, PdfLatex, XeLatex, clearAllPackageCache, deletePackageCache, ensureCacheVersion, isPackageCached };
//# sourceMappingURL=index.js.map
