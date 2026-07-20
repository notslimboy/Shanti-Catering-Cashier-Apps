const createStoreImpl = (createState) => {
  let state;
  const listeners = new Set();
  const setState = (partial, replace) => {
    const nextState = typeof partial === "function" ? partial(state) : partial;
    if (Object.is(nextState, state)) return;
    const previousState = state;
    const shouldReplace = replace != null ? replace : typeof nextState !== "object" || nextState === null;
    state = shouldReplace ? nextState : Object.assign({}, state, nextState);
    listeners.forEach((listener) => listener(state, previousState));
  };
  const getState = () => state;
  const getInitialState = () => initialState;
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const api = { setState, getState, getInitialState, subscribe };
  const initialState = state = createState(setState, getState, api);
  return api;
};

const createStore = (createState) => createState ? createStoreImpl(createState) : createStoreImpl;

export { createStore };
