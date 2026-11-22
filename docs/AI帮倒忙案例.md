# 智约 · AI 帮倒忙案例

> 记录时间：2026-11-22
> 记录人：史曼琪
> 说明：本文记录本次 S2 验收中**真实发生**的 AI 辅助过程。提示词、AI 修改、报错输出、修复 diff 和验证结果都来自实际终端记录，没有编造。
> 文末另附一条验收中发现的真实业务缺陷（D-01），它不冒充“AI 回答错误”，但与 AI 辅助代码的边界测试直接相关。

## 案例一：AI 把 Node 测试命令写成目录参数，Windows 上直接启动失败

### 1. 原始提示词（任务要求）

来自 `docs/史曼琪任务清单.md` 第 4.1 节：

> 在 `backend/tests/` 下新增文件（例如 `credit.test.js`）……
> 要求：使用 `node:test` 和 `fetch`，与现有 `core.test.js` 风格一致……
> 运行命令：`cd backend && npm test`

在上述要求下，AI 辅助修改 `package.json` 的 test 脚本，目标是让新增的测试文件和 `core.test.js` 一起被 `npm test` 执行。

### 2. AI 的回答

AI 直接修改 `backend/package.json`：

```diff
- "test": "node --test tests/core.test.js"
+ "test": "node --test --test-concurrency=1 tests/"
```

AI 的解释是：`node --test` 接受目录参数，会递归执行 `tests/` 下的测试文件；`--test-concurrency=1` 可以避免两个测试文件同时改数据库。

这个解释听起来合理，但**没有在 Windows + 当前 Node 版本上实际运行验证**。

### 3. 如何发现错误

执行 `cd backend && npm test`，没有跑测试，直接报错：

```text
node:internal/modules/cjs/loader:1520
      throw err;
      ^

Error: Cannot find module 'C:\Users\30763\Desktop\zhiyue-campus-booking\backend\tests'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1517:15)
    ...
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v24.19.0
✖ tests (260.9403ms)
ℹ tests 1
ℹ fail 1
```

Node 把 `tests/` 当成了一个要加载的模块，而不是测试目录。随后又试了不带斜杠的目录参数：

```bash
node --test --test-concurrency=1 tests
```

结果同样失败。换成显式 glob 后才正常：

```bash
node --test --test-concurrency=1 "tests/*.test.js"
```

### 4. 改前 / 改后 diff

错误版本（AI 第一次回答）：

```diff
- "test": "node --test tests/core.test.js"
+ "test": "node --test --test-concurrency=1 tests/"
```

最终修复：

```diff
- "test": "node --test tests/core.test.js"
+ "test": "node --test --test-concurrency=1 \"tests/*.test.js\""
```

### 5. 验证

- 分支 `feat/s2-checkin-credit`：`npm test` → 40 条通过（20 条原有 + 20 条签到/信用）。
- 分支 `feat/s2-admin-ops`：`npm test` → 31 条通过（20 条原有 + 11 条后台运营）。
- 两个分支本地合并后：`npm test` → **51 条全部通过**，输出 `pass 51 / fail 0`。
- 新增的 `credit.test.js` 和 `admin-ops.test.js` 都被实际执行，不是“只改了脚本没跑”。

### 6. 结论

1. **AI 对运行环境的判断可能是错的**。同一个 Node 命令在不同平台/版本上行为不同，AI 的“应该可以”不能代替实际执行。
2. **测试脚本本身也要验证**。这次错误不在业务代码，而在“怎么跑测试”；如果只看 AI 的解释、不去跑 `npm test`，会误以为测试已经接好。
3. **修复方式要尽量显式**。用 `"tests/*.test.js"` 明确告诉 Node 要跑哪些文件，比依赖目录递归更可控。
4. **AI 适合提假设，终端输出才是证据**。本次保留了完整报错和前后 diff，答辩时可以直接讲“AI 错在哪、怎么发现、怎么改”。

## 附：验收中发现的真实业务缺陷（D-01，不是 AI 回答错误）

### 现象

管理端“利用率统计”选择同一天作为开始和结束日期（`from=2026-11-23`、`to=2026-11-23`），页面显示“总预约时长 0 分钟”，但数据库里确实有一笔 10:00—11:00 的预约。

原始接口返回：

```json
{
  "from": "2026-11-23",
  "to": "2026-11-23",
  "items": [
    {
      "resourceId": 6,
      "days": 1,
      "bookedMinutes": 0,
      "bookingCount": 0,
      "capacityMinutes": 780
    }
  ]
}
```

### 原因

`backend/src/services/credit.js#getUtilization` 把日期范围当成半开区间：

```js
WHERE start_at >= ? AND start_at < ?
// 参数 [fromText, toText]
```

`toText` 是 `2026-11-23`，SQL 隐含为 `2026-11-23 00:00:00`，于是结束日期**当天**的预约全部被排除。同时天数用 `end - start`，`from=to` 时算成 0 天，又被 `Math.max(1, ...)` 兜成 1 天，导致“有预约但 0 分钟”的矛盾结果。

### 修复 diff

```diff
+ import { addDays, formatDateTime, parseDate } from '../utils/time.js';
...
+ const from = parseDate(fromText);
+ const to = parseDate(toText);
+ if (!from || !to || from > to) {
+   throw new AppError(400, ErrorCodes.VALIDATION_ERROR,
+     '日期范围格式应为 YYYY-MM-DD，且开始日期不能晚于结束日期');
+ }
+ // 日期范围按自然日包含首尾两天，查询上界取结束日期的次日 00:00。
+ const endExclusive = addDays(to, 1);
...
-     AND start_at >= ? AND start_at < ?
-   [fromText, toText],
+     AND start_at >= ? AND start_at < ?
+   [formatDateTime(from), formatDateTime(endExclusive)],
   );
-  const start = new Date(`${fromText} 00:00:00`.replace(' ', 'T'));
-  const end = new Date(`${toText} 00:00:00`.replace(' ', 'T'));
-  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
+  const days = Math.max(1, Math.round((endExclusive.getTime() - from.getTime()) / 86_400_000));
```

### 验证

修复后同一请求返回：

```json
{
  "days": 1,
  "bookedMinutes": 60,
  "bookingCount": 1,
  "capacityMinutes": 780,
  "utilizationRate": 0.0769
}
```

并补充了自动化用例 `A-03 利用率统计按自然日包含首尾两天`，覆盖 `from=to` 和 `from<to` 两种范围；`npm test` 通过。

### 结论

- 日期范围必须写清“包含首尾”还是“半开区间”，代码和页面文案要一致。
- `from=to` 是最容易漏掉的边界，应该单独写测试。
- 统计算法尤其要拿真实数据对数，不能只看页面上“有数字”。

## AI 使用原则（本次验收总结）

1. **让 AI 改代码前，先让它复述业务规则和边界**；规则以《业务规则卡确认单》为准，不以 AI 的记忆为准。
2. **AI 的每个命令都要在目标环境实跑**；本次 `node --test tests/` 就是反面例子。
3. **AI 生成的测试要能失败**：先确认用例在缺陷版本上会红，再确认修复后变绿，避免“测试永远通过”。
4. **保留原始输出**：报错、接口响应、截图、diff 都留档，答辩时能还原过程，而不是只说“AI 写的”。
