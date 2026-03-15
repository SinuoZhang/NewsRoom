# Third-Party Notices

This document lists third-party Python and JavaScript dependencies used by this repository, with license metadata re-checked from local package metadata and registry metadata where needed.

## License Summary (All Dependencies)

| License | Package Count |
|---|---:|
| MIT | 222 |
| BSD-3-Clause | 7 |
| ISC | 6 |
| Apache-2.0 | 3 |
| License :: OSI Approved :: MIT License | 2 |
| BSD License | 1 |
| BSD-2-Clause | 1 |
| CC-BY-4.0 | 1 |
| Dual License | 1 |
| MIT License | 1 |
| MPL-2.0 | 1 |
| PSF-2.0 | 1 |

## Compliance Notes (Important)

| License Family | What to Keep in Mind |
|---|---|
| MIT / ISC / BSD-2-Clause / BSD-3-Clause | Permissive licenses. Keep copyright and license text in distributions. |
| Apache-2.0 | Permissive with patent grant. Keep license text; include NOTICE content when provided by upstream. |
| MPL-2.0 | File-level copyleft. Modifications to MPL-covered files must remain under MPL when redistributed. |
| CC-BY-4.0 | Attribution required. Relevant for data package `caniuse-lite` used in frontend toolchain metadata. |
| Dual License / Classifier-based labels | Follow upstream package metadata and repository LICENSE files for exact chosen terms. |

## Simplified Usage Map

### Backend Direct Wheels (`backend/requirements.txt`)

| Package | Used In | Purpose |
|---|---|---|
| fastapi | `backend/app/main.py`, `backend/app/api/routes.py` | API framework and routing |
| uvicorn | `start_local.sh` (CLI launch) | ASGI server runtime |
| SQLAlchemy | `backend/app/db.py`, `backend/app/models.py`, `backend/app/api/routes.py`, `backend/app/services/*.py` | ORM and database access |
| pydantic-settings | `backend/app/core/config.py` | Environment-based configuration |
| python-dateutil | `backend/app/services/collector.py` | Datetime parsing |
| feedparser | `backend/app/services/collector.py`, `backend/app/api/routes.py` | RSS parsing |
| requests | `backend/app/services/market_data.py`, `backend/app/services/llm_client.py`, `backend/app/api/routes.py` | HTTP client for external APIs |
| APScheduler | `backend/app/main.py` | Scheduled collection jobs |

### Frontend Direct Packages (`frontend/package.json`)

| Package | Used In | Purpose |
|---|---|---|
| react | `frontend/src/main.tsx`, `frontend/src/App.tsx` | UI runtime |
| react-dom | `frontend/src/main.tsx` | DOM rendering |
| react-markdown | `frontend/src/App.tsx` | Render markdown responses |
| remark-gfm | `frontend/src/App.tsx` | GitHub-Flavored Markdown support |
| react-plotly.js | `frontend/src/App.tsx` | Interactive OWID data chart rendering |
| plotly.js-basic-dist-min | `frontend/src/App.tsx` | Plotly chart engine bundle |
| vite | `frontend/package.json` scripts | Dev server and build tool |
| @vitejs/plugin-react | `frontend/vite.config.ts` | React transform for Vite |
| typescript | `frontend/package.json` scripts | Type checking/build |
| @types/react, @types/react-dom | Type system only | Type definitions |
| @types/react-plotly.js, @types/plotly.js | Type system only | Plotly type definitions |

### Lockfile Families (Grouped)

| Family | Why many entries appear |
|---|---|
| `@esbuild/*` | Platform-specific binaries for multiple OS/CPU targets |
| `@rollup/rollup-*` | Platform-specific rollup binaries |
| `@babel/*` | Build transform toolchain for React/TypeScript |
| `@types/*` | Type declaration packages |
| `micromark*`, `mdast-util-*`, `hast-util-*`, `unist-util-*` | Markdown parsing/rendering stack behind `react-markdown` |
| `plotly.js-*`, `react-plotly.js` | Browser-side charting stack used in OWID data view |

## Python Packages (Backend Environment)

| Package | Version | License | License Source | Homepage |
|---|---:|---|---|---|
| annotated-types | 0.7.0 | License :: OSI Approved :: MIT License | Classifier | https://github.com/annotated-types/annotated-types |
| anyio | 4.12.1 | MIT | License-Expression | https://anyio.readthedocs.io/en/latest/ |
| APScheduler | 3.11.0 | MIT | License | https://apscheduler.readthedocs.io/en/3.x/ |
| certifi | 2026.2.25 | MPL-2.0 | License | https://github.com/certifi/python-certifi |
| charset-normalizer | 3.4.5 | MIT | License | https://github.com/jawah/charset_normalizer/blob/master/CHANGELOG.md |
| click | 8.3.1 | BSD-3-Clause | License-Expression | https://click.palletsprojects.com/page/changes/ |
| fastapi | 0.115.8 | License :: OSI Approved :: MIT License | Classifier | https://github.com/fastapi/fastapi |
| feedparser | 6.0.11 | BSD-2-Clause | License | https://github.com/kurtmckee/feedparser |
| h11 | 0.16.0 | MIT | License | https://github.com/python-hyper/h11 |
| httptools | 0.7.1 | MIT | License-Expression | https://github.com/MagicStack/httptools |
| idna | 3.11 | BSD-3-Clause | License-Expression | https://github.com/kjd/idna/blob/master/HISTORY.rst |
| pydantic | 2.12.5 | MIT | License-Expression | https://github.com/pydantic/pydantic |
| pydantic-settings | 2.8.1 | MIT | License-Expression | https://github.com/pydantic/pydantic-settings |
| pydantic_core | 2.41.5 | MIT | License-Expression | https://github.com/pydantic/pydantic-core |
| python-dateutil | 2.9.0.post0 | Dual License | License | https://github.com/dateutil/dateutil |
| python-dotenv | 1.2.2 | BSD-3-Clause | License | https://github.com/theskumar/python-dotenv |
| PyYAML | 6.0.3 | MIT | License | https://pyyaml.org/ |
| requests | 2.32.3 | Apache-2.0 | License | https://requests.readthedocs.io |
| sgmllib3k | 1.0.0 | BSD License | License | http://hg.hardcoded.net/sgmllib |
| six | 1.17.0 | MIT | License | https://github.com/benjaminp/six |
| SQLAlchemy | 2.0.38 | MIT | License | https://www.sqlalchemy.org |
| starlette | 0.45.3 | BSD-3-Clause | License-Expression | https://github.com/encode/starlette |
| typing-inspection | 0.4.2 | MIT | License-Expression | https://github.com/pydantic/typing-inspection |
| typing_extensions | 4.15.0 | PSF-2.0 | License-Expression | https://github.com/python/typing_extensions/issues |
| tzlocal | 5.3.1 | MIT | License | https://github.com/regebro/tzlocal |
| urllib3 | 2.6.3 | MIT | License-Expression | https://github.com/urllib3/urllib3/blob/main/CHANGES.rst |
| uvicorn | 0.34.0 | BSD-3-Clause | License | https://github.com/encode/uvicorn/blob/master/CHANGELOG.md |
| uvloop | 0.22.1 | MIT License | License | https://github.com/MagicStack/uvloop |
| watchfiles | 1.1.1 | MIT | License | https://github.com/samuelcolvin/watchfiles |
| websockets | 16.0 | BSD-3-Clause | License-Expression | https://github.com/python-websockets/websockets |

## JavaScript Packages (Frontend Lockfile)

| Package | Version | License | License Source | Homepage/Repo |
|---|---:|---|---|---|
| @babel/code-frame | 7.29.0 | MIT | package.json license | https://babel.dev/docs/en/next/babel-code-frame |
| @babel/compat-data | 7.29.0 | MIT | package.json license | https://github.com/babel/babel |
| @babel/core | 7.29.0 | MIT | package.json license | https://babel.dev/docs/en/next/babel-core |
| @babel/generator | 7.29.1 | MIT | package.json license | https://babel.dev/docs/en/next/babel-generator |
| @babel/helper-compilation-targets | 7.28.6 | MIT | package.json license | https://github.com/babel/babel |
| @babel/helper-globals | 7.28.0 | MIT | package.json license | https://github.com/babel/babel |
| @babel/helper-module-imports | 7.28.6 | MIT | package.json license | https://babel.dev/docs/en/next/babel-helper-module-imports |
| @babel/helper-module-transforms | 7.28.6 | MIT | package.json license | https://babel.dev/docs/en/next/babel-helper-module-transforms |
| @babel/helper-plugin-utils | 7.28.6 | MIT | package.json license | https://babel.dev/docs/en/next/babel-helper-plugin-utils |
| @babel/helper-string-parser | 7.27.1 | MIT | package.json license | https://babel.dev/docs/en/next/babel-helper-string-parser |
| @babel/helper-validator-identifier | 7.28.5 | MIT | package.json license | https://github.com/babel/babel |
| @babel/helper-validator-option | 7.27.1 | MIT | package.json license | https://github.com/babel/babel |
| @babel/helpers | 7.28.6 | MIT | package.json license | https://babel.dev/docs/en/next/babel-helpers |
| @babel/parser | 7.29.0 | MIT | package.json license | https://babel.dev/docs/en/next/babel-parser |
| @babel/plugin-transform-react-jsx-self | 7.27.1 | MIT | package.json license | https://babel.dev/docs/en/next/babel-plugin-transform-react-jsx-self |
| @babel/plugin-transform-react-jsx-source | 7.27.1 | MIT | package.json license | https://babel.dev/docs/en/next/babel-plugin-transform-react-jsx-source |
| @babel/template | 7.28.6 | MIT | package.json license | https://babel.dev/docs/en/next/babel-template |
| @babel/traverse | 7.29.0 | MIT | package.json license | https://babel.dev/docs/en/next/babel-traverse |
| @babel/types | 7.29.0 | MIT | package.json license | https://babel.dev/docs/en/next/babel-types |
| @esbuild/aix-ppc64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/android-arm | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/android-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/android-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/darwin-arm64 | 0.25.12 | MIT | package.json license | https://github.com/evanw/esbuild |
| @esbuild/darwin-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/freebsd-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/freebsd-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-arm | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-ia32 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-loong64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-mips64el | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-ppc64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-riscv64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-s390x | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/linux-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/netbsd-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/netbsd-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/openbsd-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/openbsd-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/openharmony-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/sunos-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/win32-arm64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/win32-ia32 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @esbuild/win32-x64 | 0.25.12 | MIT | npm registry | https://github.com/evanw/esbuild#readme |
| @jridgewell/gen-mapping | 0.3.13 | MIT | package.json license | https://github.com/jridgewell/sourcemaps/tree/main/packages/gen-mapping |
| @jridgewell/remapping | 2.3.5 | MIT | package.json license | https://github.com/jridgewell/sourcemaps/tree/main/packages/remapping |
| @jridgewell/resolve-uri | 3.1.2 | MIT | package.json license | https://github.com/jridgewell/resolve-uri |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | package.json license | https://github.com/jridgewell/sourcemaps/tree/main/packages/sourcemap-codec |
| @jridgewell/trace-mapping | 0.3.31 | MIT | package.json license | https://github.com/jridgewell/sourcemaps/tree/main/packages/trace-mapping |
| @rolldown/pluginutils | 1.0.0-beta.27 | MIT | package.json license | https://github.com/rolldown/rolldown |
| @rollup/rollup-android-arm-eabi | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-android-arm64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-darwin-arm64 | 4.59.0 | MIT | package.json license | https://rollupjs.org/ |
| @rollup/rollup-darwin-x64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-freebsd-arm64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-freebsd-x64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-arm-gnueabihf | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-arm-musleabihf | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-arm64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-arm64-musl | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-loong64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-loong64-musl | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-ppc64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-ppc64-musl | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-riscv64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-riscv64-musl | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-s390x-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-x64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-linux-x64-musl | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-openbsd-x64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-openharmony-arm64 | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-win32-arm64-msvc | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-win32-ia32-msvc | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-win32-x64-gnu | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @rollup/rollup-win32-x64-msvc | 4.59.0 | MIT | npm registry | https://rollupjs.org/ |
| @types/babel__core | 7.20.5 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__core |
| @types/babel__generator | 7.27.0 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__generator |
| @types/babel__template | 7.4.4 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__template |
| @types/babel__traverse | 7.28.0 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/babel__traverse |
| @types/debug | 4.1.12 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/debug |
| @types/estree | 1.0.8 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree |
| @types/estree-jsx | 1.0.5 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/estree-jsx |
| @types/hast | 3.0.4 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/hast |
| @types/mdast | 4.0.4 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/mdast |
| @types/ms | 2.1.0 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/ms |
| @types/prop-types | 15.7.15 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/prop-types |
| @types/react | 18.3.28 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react |
| @types/react-dom | 18.3.7 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/react-dom |
| @types/unist | 3.0.3 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| @ungap/structured-clone | 1.3.0 | ISC | package.json license | https://github.com/ungap/structured-clone#readme |
| @vitejs/plugin-react | 4.7.0 | MIT | package.json license | https://github.com/vitejs/vite-plugin-react/tree/main/packages/plugin-react#readme |
| bail | 2.0.2 | MIT | package.json license | https://github.com/wooorm/bail |
| baseline-browser-mapping | 2.10.7 | Apache-2.0 | package.json license | https://github.com/web-platform-dx/baseline-browser-mapping |
| browserslist | 4.28.1 | MIT | package.json license | https://github.com/browserslist/browserslist |
| caniuse-lite | 1.0.30001778 | CC-BY-4.0 | package.json license | https://github.com/browserslist/caniuse-lite |
| ccount | 2.0.1 | MIT | package.json license | https://github.com/wooorm/ccount |
| character-entities | 2.0.2 | MIT | package.json license | https://github.com/wooorm/character-entities |
| character-entities-html4 | 2.1.0 | MIT | package.json license | https://github.com/wooorm/character-entities-html4 |
| character-entities-legacy | 3.0.0 | MIT | package.json license | https://github.com/wooorm/character-entities-legacy |
| character-reference-invalid | 2.0.1 | MIT | package.json license | https://github.com/wooorm/character-reference-invalid |
| comma-separated-tokens | 2.0.3 | MIT | package.json license | https://github.com/wooorm/comma-separated-tokens |
| convert-source-map | 2.0.0 | MIT | package.json license | https://github.com/thlorenz/convert-source-map |
| csstype | 3.2.3 | MIT | package.json license | https://github.com/frenic/csstype |
| debug | 4.4.3 | MIT | package.json license | https://github.com/debug-js/debug |
| decode-named-character-reference | 1.3.0 | MIT | package.json license | https://github.com/wooorm/decode-named-character-reference |
| dequal | 2.0.3 | MIT | package.json license | https://github.com/lukeed/dequal |
| devlop | 1.1.0 | MIT | package.json license | https://github.com/wooorm/devlop |
| electron-to-chromium | 1.5.313 | ISC | package.json license | https://github.com/kilian/electron-to-chromium |
| esbuild | 0.25.12 | MIT | package.json license | https://github.com/evanw/esbuild |
| escalade | 3.2.0 | MIT | package.json license | https://github.com/lukeed/escalade |
| escape-string-regexp | 5.0.0 | MIT | package.json license | https://github.com/sindresorhus/escape-string-regexp |
| estree-util-is-identifier-name | 3.0.0 | MIT | package.json license | https://github.com/syntax-tree/estree-util-is-identifier-name |
| extend | 3.0.2 | MIT | package.json license | https://github.com/justmoon/node-extend |
| fdir | 6.5.0 | MIT | package.json license | https://github.com/thecodrr/fdir#readme |
| fsevents | 2.3.3 | MIT | package.json license | https://github.com/fsevents/fsevents |
| gensync | 1.0.0-beta.2 | MIT | package.json license | https://github.com/loganfsmyth/gensync |
| hast-util-to-jsx-runtime | 2.3.6 | MIT | package.json license | https://github.com/syntax-tree/hast-util-to-jsx-runtime |
| hast-util-whitespace | 3.0.0 | MIT | package.json license | https://github.com/syntax-tree/hast-util-whitespace |
| html-url-attributes | 3.0.1 | MIT | package.json license | https://github.com/rehypejs/rehype-minify/tree/main/packages/html-url-attributes |
| inline-style-parser | 0.2.7 | MIT | package.json license | https://github.com/remarkablemark/inline-style-parser |
| is-alphabetical | 2.0.1 | MIT | package.json license | https://github.com/wooorm/is-alphabetical |
| is-alphanumerical | 2.0.1 | MIT | package.json license | https://github.com/wooorm/is-alphanumerical |
| is-decimal | 2.0.1 | MIT | package.json license | https://github.com/wooorm/is-decimal |
| is-hexadecimal | 2.0.1 | MIT | package.json license | https://github.com/wooorm/is-hexadecimal |
| is-plain-obj | 4.1.0 | MIT | package.json license | https://github.com/sindresorhus/is-plain-obj |
| js-tokens | 4.0.0 | MIT | package.json license | https://github.com/lydell/js-tokens |
| jsesc | 3.1.0 | MIT | package.json license | https://mths.be/jsesc |
| json5 | 2.2.3 | MIT | package.json license | http://json5.org/ |
| longest-streak | 3.1.0 | MIT | package.json license | https://github.com/wooorm/longest-streak |
| loose-envify | 1.4.0 | MIT | package.json license | https://github.com/zertosh/loose-envify |
| lru-cache | 5.1.1 | ISC | package.json license | https://github.com/isaacs/node-lru-cache |
| markdown-table | 3.0.4 | MIT | package.json license | https://github.com/wooorm/markdown-table |
| mdast-util-find-and-replace | 3.0.2 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-find-and-replace |
| mdast-util-from-markdown | 2.0.3 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-from-markdown |
| mdast-util-gfm | 3.1.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm |
| mdast-util-gfm-autolink-literal | 2.0.1 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm-autolink-literal |
| mdast-util-gfm-footnote | 2.1.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm-footnote |
| mdast-util-gfm-strikethrough | 2.0.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm-strikethrough |
| mdast-util-gfm-table | 2.0.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm-table |
| mdast-util-gfm-task-list-item | 2.0.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-gfm-task-list-item |
| mdast-util-mdx-expression | 2.0.1 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-mdx-expression |
| mdast-util-mdx-jsx | 3.2.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-mdx-jsx |
| mdast-util-mdxjs-esm | 2.0.1 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-mdxjs-esm |
| mdast-util-phrasing | 4.1.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-phrasing |
| mdast-util-to-hast | 13.2.1 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-to-hast |
| mdast-util-to-markdown | 2.1.2 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-to-markdown |
| mdast-util-to-string | 4.0.0 | MIT | package.json license | https://github.com/syntax-tree/mdast-util-to-string |
| micromark | 4.0.2 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark |
| micromark-core-commonmark | 2.0.3 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-core-commonmark |
| micromark-extension-gfm | 3.0.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm |
| micromark-extension-gfm-autolink-literal | 2.1.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-autolink-literal |
| micromark-extension-gfm-footnote | 2.1.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-footnote |
| micromark-extension-gfm-strikethrough | 2.1.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-strikethrough |
| micromark-extension-gfm-table | 2.1.1 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-table |
| micromark-extension-gfm-tagfilter | 2.0.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-tagfilter |
| micromark-extension-gfm-task-list-item | 2.1.0 | MIT | package.json license | https://github.com/micromark/micromark-extension-gfm-task-list-item |
| micromark-factory-destination | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-destination |
| micromark-factory-label | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-label |
| micromark-factory-space | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-space |
| micromark-factory-title | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-title |
| micromark-factory-whitespace | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-factory-whitespace |
| micromark-util-character | 2.1.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-character |
| micromark-util-chunked | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-chunked |
| micromark-util-classify-character | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-classify-character |
| micromark-util-combine-extensions | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-combine-extensions |
| micromark-util-decode-numeric-character-reference | 2.0.2 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-numeric-character-reference |
| micromark-util-decode-string | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-decode-string |
| micromark-util-encode | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-encode |
| micromark-util-html-tag-name | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-html-tag-name |
| micromark-util-normalize-identifier | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-normalize-identifier |
| micromark-util-resolve-all | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-resolve-all |
| micromark-util-sanitize-uri | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-sanitize-uri |
| micromark-util-subtokenize | 2.1.0 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-subtokenize |
| micromark-util-symbol | 2.0.1 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-symbol |
| micromark-util-types | 2.0.2 | MIT | package.json license | https://github.com/micromark/micromark/tree/main/packages/micromark-util-types |
| ms | 2.1.3 | MIT | package.json license | https://github.com/vercel/ms |
| nanoid | 3.3.11 | MIT | package.json license | https://github.com/ai/nanoid |
| node-releases | 2.0.36 | MIT | package.json license | https://github.com/chicoxyzzy/node-releases |
| parse-entities | 2.0.11 | MIT | package.json license | https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/unist |
| parse-entities | 4.0.2 | MIT | package.json license | https://github.com/wooorm/parse-entities |
| picocolors | 1.1.1 | ISC | package.json license | https://github.com/alexeyraspopov/picocolors |
| picomatch | 4.0.3 | MIT | package.json license | https://github.com/micromatch/picomatch |
| postcss | 8.5.8 | MIT | package.json license | https://postcss.org/ |
| property-information | 7.1.0 | MIT | package.json license | https://github.com/wooorm/property-information |
| react | 18.3.1 | MIT | package.json license | https://reactjs.org/ |
| react-dom | 18.3.1 | MIT | package.json license | https://reactjs.org/ |
| react-markdown | 10.1.0 | MIT | package.json license | https://github.com/remarkjs/react-markdown |
| react-refresh | 0.17.0 | MIT | package.json license | https://react.dev/ |
| remark-gfm | 4.0.1 | MIT | package.json license | https://github.com/remarkjs/remark-gfm |
| remark-parse | 11.0.0 | MIT | package.json license | https://remark.js.org |
| remark-rehype | 11.1.2 | MIT | package.json license | https://github.com/remarkjs/remark-rehype |
| remark-stringify | 11.0.0 | MIT | package.json license | https://remark.js.org |
| rollup | 4.59.0 | MIT | package.json license | https://rollupjs.org/ |
| scheduler | 0.23.2 | MIT | package.json license | https://reactjs.org/ |
| semver | 6.3.1 | ISC | package.json license | https://github.com/npm/node-semver |
| source-map-js | 1.2.1 | BSD-3-Clause | package.json license | https://github.com/7rulnik/source-map-js |
| space-separated-tokens | 2.0.2 | MIT | package.json license | https://github.com/wooorm/space-separated-tokens |
| stringify-entities | 4.0.4 | MIT | package.json license | https://github.com/wooorm/stringify-entities |
| style-to-js | 1.1.21 | MIT | package.json license | https://github.com/remarkablemark/style-to-js |
| style-to-object | 1.0.14 | MIT | package.json license | https://github.com/remarkablemark/style-to-object |
| tinyglobby | 0.2.15 | MIT | package.json license | https://superchupu.dev/tinyglobby |
| trim-lines | 3.0.1 | MIT | package.json license | https://github.com/wooorm/trim-lines |
| trough | 2.2.0 | MIT | package.json license | https://github.com/wooorm/trough |
| typescript | 5.9.3 | Apache-2.0 | package.json license | https://www.typescriptlang.org/ |
| unified | 11.0.5 | MIT | package.json license | https://unifiedjs.com |
| unist-util-is | 6.0.1 | MIT | package.json license | https://github.com/syntax-tree/unist-util-is |
| unist-util-position | 5.0.0 | MIT | package.json license | https://github.com/syntax-tree/unist-util-position |
| unist-util-stringify-position | 4.0.0 | MIT | package.json license | https://github.com/syntax-tree/unist-util-stringify-position |
| unist-util-visit | 5.1.0 | MIT | package.json license | https://github.com/syntax-tree/unist-util-visit |
| unist-util-visit-parents | 6.0.2 | MIT | package.json license | https://github.com/syntax-tree/unist-util-visit-parents |
| update-browserslist-db | 1.2.3 | MIT | package.json license | https://github.com/browserslist/update-db |
| vfile | 6.0.3 | MIT | package.json license | https://github.com/vfile/vfile |
| vfile-message | 4.0.3 | MIT | package.json license | https://github.com/vfile/vfile-message |
| vite | 6.4.1 | MIT | package.json license | https://vite.dev |
| yallist | 3.1.1 | ISC | package.json license | https://github.com/isaacs/yallist |
| zwitch | 2.0.4 | MIT | package.json license | https://github.com/wooorm/zwitch |

## Attribution Reminder

- Preserve third-party license texts in redistribution packages.
- Keep this file and `ACKNOWLEDGEMENTS.md` with releases.
- If you distribute binaries/containers, include third-party license notices in release artifacts.
