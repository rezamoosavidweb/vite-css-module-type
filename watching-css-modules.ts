import fs from "fs";
import path from "path";
import postcss from "postcss";
import selectorParse from "postcss-selector-parser";
import prettier from "prettier";
import { Plugin, ResolvedConfig } from "vite";

function isDir(dir) {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function isCSSSelectorValid(selector) {
  try {
    selectorParse().processSync(selector);
    return true; // If no errors occurred, the selector is valid
  } catch (error) {
    console.error(`Invalid CSS selector: ${selector}`);
    return false; // If an error occurred, the selector is not valid
  }
}
const changingFilePath = (config: ResolvedConfig, file: string): string =>
  path.join(config.build.outDir, path.relative(config.publicDir, file));

const removeDupStrFromArray = (arr: string[]): string[] => {
  const uniqueArray = [];

  for (const str of arr) {
    if (!uniqueArray.includes(str)) {
      uniqueArray.push(str);
    }
  }

  return uniqueArray;
};

const typeDeceleration = async (classArray: string[]) => {
  const data = `declare const styles: {${classArray
    ?.map((el) => `readonly '${el}': string;`)
    .join("")}};export default styles;`;
  const formattedData = await prettier.format(data, {
    parser: "typescript",
  });
  return formattedData;
};

function createUniquesClassName(fullPath): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const css = fs.readFileSync(fullPath);
    const classNames = [];
    postcss()
      .process(css, { from: fullPath, to: fullPath?.replace(".css", ".d.css") })
      .then(async (result) => {
        result.root.walkRules((rule) => {
          if (!isCSSSelectorValid(rule.selector)) return;
          selectorParse((selectors) => {
            selectors.walkClasses((selector) => {
              classNames.push(selector.value);
            });
          }).process(rule.selector);
        });

        const uniquesClassName = await removeDupStrFromArray(classNames);
        resolve(uniquesClassName);
      })
      .catch(reject);
  });
}
async function createDecelerationFile(fullPath) {
  const uniquesClassName = await createUniquesClassName(fullPath);

  if (uniquesClassName?.length > 0) {
    const decelerationPath = fullPath?.replace(
      ".module.css",
      ".module.css.d.ts"
    );
    const formattedDeceleration = await typeDeceleration(uniquesClassName);

    try {
      fs.writeFileSync(decelerationPath, formattedDeceleration);
    } catch (err) {
      console.log("error in writing file:", err);
    }
  }
}
function getCssModulesFiles(pathDir) {
  const directory = pathDir;

  if (isDir(directory)) {
    fs.readdirSync(directory).forEach(async (dir) => {
      const fullPath = path.join(directory, dir);
      if (isDir(fullPath)) return getCssModulesFiles(fullPath);
      if (!fullPath.endsWith(".module.css")) return;

      try {
        createDecelerationFile(fullPath);
      } catch (e) {
        console.log(e);
      }
    });
  } else {
    if (!directory.endsWith(".module.css")) return;
    createDecelerationFile(directory);
  }
}

export function CssModuleTypes(): Plugin {
  return {
    name: "css-modules-types",
    apply: "serve",
    async configureServer() {
      const directory = path.join(__dirname, "./src");
      await getCssModulesFiles(directory);
    },
    // HMR
    async handleHotUpdate({ server: { config }, file }) {
      if (file.endsWith("module.css")) {
        fs.readFile(changingFilePath(config, file), "utf8", (err, css) => {
          postcss()
            .process(css, {
              from: changingFilePath(config, file),
            })
            .then(async (result) => {
              const classNames = [];
              try {
                result.root.walkRules((rule) => {
                  if (!isCSSSelectorValid(rule.selector)) return;
                  selectorParse((selectors) => {
                    selectors.walkClasses((selector) => {
                      classNames.push(selector.value);
                    });
                  }).process(rule.selector);
                });

                const uniquesClassName = removeDupStrFromArray(classNames);

                if (uniquesClassName?.length > 0) {
                  const newDestPath = changingFilePath(config, file)?.replace(
                    ".module.css",
                    ".module.css.d.ts"
                  );
                  fs.writeFile(
                    newDestPath,
                    await typeDeceleration(uniquesClassName),
                    (error) => console.log("error:", error)
                  );
                }
              } catch (error) {
                console.log(`error in ${result.opts.from}:`, error);
              }
            })
            .catch((err) => console.log(`error in css file:`, err));
        });
      }
    },
  };
}
