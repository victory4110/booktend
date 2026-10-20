import assert from 'node:assert/strict';
    import { readFileSync, readdirSync } from 'node:fs';
    import path from 'node:path';
    import test from 'node:test';
    
    /**
     * Guards against shipping markup whose classes no stylesheet defines, which is
     * how the Services panel ended up rendering with browser defaults.
     *
     * A class is acceptable when it is defined in one of the app stylesheets or is a
     * Tailwind utility. Utility detection is a prefix match; add to `tailwindUtilities`
     * if a new utility is not recognised.
     */
    function findProjectRoot(): string {
      let current = import.meta.dirname;
      while (!readdirSync(current).includes('package.json')) current = path.dirname(current);
      return current;
    }
    
    const projectRoot = findProjectRoot();
    
    const tailwindUtilities = new Set(['sr-only', 'antialiased', 'hidden', 'block', 'inline', 'flex', 'grid', 'underline', 'lowercase', 'uppercase', 'relative', 'absolute', 'static', 'sticky', 'fixed', 'overflow-hidden', 'border', 'shadow', 'rounded', 'cursor-pointer', 'invisible', 'truncate', 'italic']);
    const tailwindPrefixes = ['flex-', 'grid-', 'gap-', 'p-', 'px-', 'py-', 'pt-', 'pb-', 'pl-', 'pr-', 'm-', 'mx-', 'my-', 'mt-', 'mb-', 'ml-', 'mr-', 'w-', 'h-', 'min-', 'max-', 'text-', 'bg-', 'border-', 'rounded-', 'shadow-', 'space-', 'items-', 'justify-', 'font-', 'leading-', 'tracking-', 'z-', 'top-', 'right-', 'bottom-', 'left-', 'col-', 'row-', 'divide-', 'transition', 'duration-', 'opacity-', 'whitespace-', 'aspect-', 'place-', 'order-', 'basis-', 'grow', 'shrink', 'self-', 'object-', 'inset-', 'translate-', 'scale-', 'ring-', 'outline-', 'ring-offset-'];
    
    function stylesheetFiles(): string[] {
      const styles = path.join(projectRoot, 'src', 'styles');
      return [...readdirSync(styles).filter((file) => file.endsWith('.css')).map((file) => path.join(styles, file)), path.join(projectRoot, 'app', 'global.css')];
    }
    
    function markupFiles(): string[] {
      const files: string[] = [];
      for (const dir of [path.join(projectRoot, 'src', 'components'), path.join(projectRoot, 'app')]) {
        const walk = (current: string): void => {
          for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.tsx')) files.push(full);
          }
        };
        walk(dir);
      }
      return files;
    }
    
    function definedClasses(): Set<string> {
      const defined = new Set<string>();
      for (const file of stylesheetFiles()) {
        const css = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const selectors of css.matchAll(/(?:^|})([^{}]+)\{/g)) {
          for (const name of selectors[1].matchAll(/\.([A-Za-z0-9_-]+)/g)) defined.add(name[1]);
        }
      }
      return defined;
    }
    
    function usedClasses(): Map<string, string> {
      const used = new Map<string, string>();
      for (const file of markupFiles()) {
        const source = readFileSync(file, 'utf8');
        for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
          // Drop JS expressions inside template literals so `view${active}` only
          // contributes `view`, never `active`.
          const literal = (match[2] ?? match[1]).replace(/\$\{[^}]*\}/g, ' ');
          for (const token of literal.split(/\s+/)) {
            if (token && /^[A-Za-z0-9_-]+$/.test(token)) used.set(token, path.relative(projectRoot, file));
          }
        }
      }
      return used;
    }
    
    function isTailwindUtility(token: string): boolean {
      return tailwindUtilities.has(token) || tailwindPrefixes.some((prefix) => token.startsWith(prefix));
    }
    
    test('every class used in the markup is defined in a stylesheet or is a Tailwind utility', () => {
      const defined = definedClasses();
      const missing = [...usedClasses()]
        .filter(([token]) => !defined.has(token) && !isTailwindUtility(token))
        .map(([token, file]) => `${token} (used in ${file})`);
    
      assert.deepEqual(missing, [], `These classes have no CSS rule and are not Tailwind utilities, so they render unstyled:\n  ${missing.join('\n  ')}`);
    });
    
    test('the stylesheet scan finds the app design system', () => {
      // A guard against a parser change silently turning the check above into a no-op.
      const defined = definedClasses();
      for (const name of ['panel', 'sidebar', 'status-pill', 'services-panel']) assert.ok(defined.has(name), `expected .${name} to be found in the stylesheets`);
      assert.ok(usedClasses().size > 80, 'the markup scan should find the component classes');
    });
    