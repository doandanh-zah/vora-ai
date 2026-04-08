# VORA Status Report (2026-04-02)

## 1) Tom tat nhanh
- **Moc 3 (Rebrand user-facing):** DA DAT (audit pass).
- **Moc 2 (Tool smoke local):** DA DAT (PASS on current branch).
- **Phat hanh npm user-style:** `vora-ai@0.1.1` da publish va cai global thanh cong.

## 2) Nhung gi da hoan thanh trong dot nay
1. Sua crash runtime image-generation khi provider runtime khong san sang:
   - `vora-ai/vora-core/src/agents/tools/image-generate-tool.ts`
2. Them regression test cho image-generation fallback:
   - `vora-ai/vora-core/src/agents/tools/image-generate-tool.test.ts`
3. Hoan thien smoke script M2 cho headless/local:
   - `vora-ai/vora-core/scripts/phase0-m2-tool-smoke.mjs`
4. Them lai bo test planner thieu file (de vitest config khong con vo):
   - `vora-ai/vora-core/scripts/test-planner/*`
5. Bo sung bootstrap test thieu:
   - `vora-ai/vora-core/test/non-isolated-runner.ts`
   - `vora-ai/vora-core/test/setup.ts`
6. Sua bug version runtime hien `0.0.0` cho npm package `vora-ai`:
   - `vora-ai/vora-core/src/version.ts`
   - `vora-ai/vora-core/src/version.test.ts`
7. Tang cuong prepack guard + dong bo `build-info`:
   - `vora-ai/vora-core/scripts/vora-prepack.mjs`
8. Publish ban fix len npm:
   - `vora-ai@0.1.1`

## 3) Ket qua kiem chung moi nhat

### 3.1 Moc 3
- Lenh: `node scripts/phase0-m3-rebrand-audit.mjs`
- Ket qua: `[phase0:m3] PASS: user-facing rebrand audit clean.`

### 3.2 Moc 2
- Lenh: `node scripts/phase0-m2-tool-smoke.mjs`
- Ket qua: `[phase0:m2] PASS: tool execution confirmed and agent reply matched expected token.`

### 3.3 Unit test nhanh (vitest)
- Lenh: `pnpm exec vitest run --config vitest.unit.config.ts src/version.test.ts`
- Ket qua: `Test Files 1 passed`, `Tests 13 passed`.

### 3.4 NPM publish/install theo hanh vi user that
- Publish: `npm publish --access public` (temp publish dir) => `+ vora-ai@0.1.1`
- Cai global: `npm i -g vora-ai` => thanh cong
- Kiem tra runtime:
  - `vora --version` => `Vora 0.1.1 (...)`
  - `npm ls -g --depth=0 vora-ai` => `vora-ai@0.1.1`

## 4) Van de con ton tai (blockers)
- **Khong con blocker ky thuat cho M2/M3 cua Zah.**
- **Phan Agora STT PoC** (task online trong Phase 0 cua Zah) chua co bang chung PASS moi trong report nay.

## 5) Viec can lam tiep (uu tien)
1. Dong bo lai source-of-truth phat hanh:
   - Repo local hien pack ra `vora@0.1.0`, trong khi npm da co `vora-ai@0.1.1`.
2. Commit + push cac fix dang nam o working tree len private repo.
3. Chay va luu artifact cho Agora Web SDK STT PoC de dong 100% Phase 0 cua Zah.

## 6) Trang thai ket luan hien tai
- **Moc 3:** xong.
- **Moc 2:** xong.
- **NPM cai dung kieu user that (`npm i -g vora-ai`):** xong.
- **Phan con lai cua Zah Phase 0 ngoai Agora:** khong con blocker ky thuat.
