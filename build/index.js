const path = require("path")
const fs = require("fs")
const fstool = require("./fstool")
const NCC = require('@vercel/ncc');

const buildMain = path.join(process.cwd(), "/src/index.js");
const outputPath = path.join(process.cwd(), "/dist");
const nccTempPath = path.join(outputPath, "/.ncc")
//-e加密 -b打包build
const ENV_BUILD = "-b";
const ENV_ENCODE = "-e";
function compile() {
    NCC(buildMain, {
        // provide a custom cache path or disable caching
        cache: false,
        // externals to leave as requires of the build
        externals: ["externalpackage"],
        // directory outside of which never to emit assets
        filterAssetBase: process.cwd(), // default
        minify: true, // default
        sourceMap: false, // default
        assetBuilds: true, // default
        sourceMapBasePrefix: '../', // default treats sources as output-relative
        // when outputting a sourcemap, automatically include
        // source-map-support in the output file (increases output by 32kB).
        sourceMapRegister: false, // default
        watch: false, // default
        license: '', // default does not generate a license file
        v8cache: false, // default
        quiet: false, // default
        debugLog: false // default
    }).then(async ({ code, map, assets }) => {
        if (fs.existsSync(outputPath)) {
            fstool.deleteFolderRecursive(outputPath)
        }
        fstool.mkdirsSync(outputPath)
        let outPath = nccTempPath;
        if (process.argv.find(x => x == ENV_BUILD)) {
            if (fs.existsSync(nccTempPath)) {
                fstool.deleteFolderRecursive(nccTempPath)
            }
            fstool.mkdirsSync(nccTempPath)
        } else {
            outPath = outputPath
        }
        //输出资源文件
        // Object.keys(assets).forEach(key => {
        //     const _filepath = path.join(outPath, key);
        //     fstool.mkdirsSync(path.dirname(_filepath))
        //     fs.writeFileSync(_filepath, assets[key].source)
        // })
        if (process.argv.find(x => x == ENV_ENCODE)) {
            const obfuscator = require("./javascript-obfuscator.json")
            const obfuscationResult = require('javascript-obfuscator').obfuscate(
                code, {
                "compact": true,
                ...obfuscator
            });
            code = obfuscationResult.getObfuscatedCode();
        }
        const mainPath = path.join(outPath, "/index.js");
        fs.writeFileSync(mainPath, code)
        if (process.argv.find(x => x == ENV_BUILD)) {
            const _buildPath = path.join(__dirname, "./build.json");
            await require('pkg').exec([mainPath, '-d', '-C', '--output', '-c', _buildPath]);
            fstool.deleteFolderRecursive(nccTempPath)
        }

    })
}
compile()





