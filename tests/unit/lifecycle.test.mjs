import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetGlobals, runScript } from '../helpers/site.mjs';

/* js/lifecycle.js - the module registry every other script mounts through. */

beforeEach(() => {
  resetGlobals();
  runScript('lifecycle');
});

describe('PAGE.mount', () => {
  it('boots every registered module with the scope it is given', () => {
    const a = vi.fn(), b = vi.fn();
    window.PAGE.register('a', a);
    window.PAGE.register('b', b);
    window.PAGE.mount(document);
    expect(a).toHaveBeenCalledWith(document);
    expect(b).toHaveBeenCalledWith(document);
  });

  it('boots only the allowlist when one is given', () => {
    const a = vi.fn(), b = vi.fn();
    window.PAGE.register('a', a);
    window.PAGE.register('b', b);
    window.PAGE.mount(document, ['b']);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledOnce();
  });

  it('boots in registration order, which is script order', () => {
    const order = [];
    ['one', 'two', 'three'].forEach((n) => window.PAGE.register(n, () => order.push(n)));
    window.PAGE.mount(document);
    expect(order).toEqual(['one', 'two', 'three']);
  });

  it('isolates a module that throws: the rest still mount', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const after = vi.fn();
    window.PAGE.register('broken', () => { throw new Error('boom'); });
    window.PAGE.register('after', after);
    expect(() => window.PAGE.mount(document)).not.toThrow();
    expect(after).toHaveBeenCalledOnce();
    expect(err).toHaveBeenCalledWith('[mount] broken', expect.any(Error));
  });
});

describe('PAGE.unmount', () => {
  it('runs every teardown a module returned', () => {
    const down = vi.fn();
    window.PAGE.register('a', () => down);
    window.PAGE.register('no-teardown', () => undefined);
    window.PAGE.mount(document);
    window.PAGE.unmount();
    expect(down).toHaveBeenCalledOnce();
  });

  it('does not run a teardown twice', () => {
    const down = vi.fn();
    window.PAGE.register('a', () => down);
    window.PAGE.mount(document);
    window.PAGE.unmount();
    window.PAGE.unmount();
    expect(down).toHaveBeenCalledOnce();
  });

  it('keeps going when a teardown throws', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const second = vi.fn();
    window.PAGE.register('a', () => () => { throw new Error('boom'); });
    window.PAGE.register('b', () => second);
    window.PAGE.mount(document);
    window.PAGE.unmount();
    expect(second).toHaveBeenCalledOnce();
  });
});

describe('PAGE.unmountOnly - the phone falling back to static', () => {
  it('tears down only the named modules and keeps the rest live', () => {
    const live = vi.fn(), stays = vi.fn();
    window.PAGE.register('substrate', () => live);
    window.PAGE.register('mobile', () => stays);
    window.PAGE.mount(document);

    window.PAGE.unmountOnly(['substrate']);
    expect(live).toHaveBeenCalledOnce();
    expect(stays).not.toHaveBeenCalled();

    window.PAGE.unmount();
    expect(stays).toHaveBeenCalledOnce();
    expect(live).toHaveBeenCalledOnce();          // not torn down a second time
  });
});
