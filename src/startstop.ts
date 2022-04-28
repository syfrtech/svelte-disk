/**
 * Probably don't need this... start/stop delays restoration
 *
 * Info on pros/cons: https://github.com/millermedeiros/js-signals/wiki/Comparison-between-different-Observer-Pattern-implementations
 */
import type { StartStopNotifier, Subscriber, Unsubscriber } from "svelte/store";

/**
 * The subscription status of a Svelte store.
 *
 * "start" is announced with first subscriber.
 * "stop" is announced when last subscriber is dropped.
 *
 * @see https://svelte.dev/docs#run-time-svelte-store-writable
 */
type StartStopStatus = "start" | "stop";

/**
 * Notified when a Svelte store `StartStopStatus` changes.
 */
export type StartStopObserver<T> = (
  status: StartStopStatus,
  set: Subscriber<T>
) => void;

/**
 * A Pub/Sub for notifying subscribers when `StartStopStatus` changes.
 */
export class StartStopObservable<T> {
  private observers: StartStopObserver<T>[] = [];

  /**
   * Registers a new subscriber to be notified when
   * `StartStopStatus` changes for the Svelte store.
   * @see https://svelte.dev/docs#run-time-svelte-store-writable
   */
  public subscribe(observer: StartStopObserver<T>) {
    this.observers.push(observer);
  }
  /**
   * Unsubscribe the observer, such as after a persisted value is restored.
   */
  public unsubscribe(observer: StartStopObserver<T>) {
    this.observers = this.observers.filter(
      (_observer) => _observer !== observer
    );
  }

  /**
   * Announces StartStopStatus to subscribers.
   */
  public publish(status: StartStopStatus, set: Subscriber<T>) {
    this.observers.forEach((subscriber) => subscriber(status, set));
  }
}

/**
 * Creates a `StartStopNotifier` that others can subscribe to.
 * The return can be used as the second parameter in a Svelte store.
 * @see https://svelte.dev/docs#run-time-svelte-store-writable
 *
 * @note this allows subscribers to set the store value (including `Readable`)
 */
export function observableToNotifier<T>(observable: StartStopObservable<T>) {
  let start: StartStopNotifier<T> = (set) => {
    observable.publish("start", set);
    let stop = observable.publish("stop", set);
    return stop;
  };
  return start;
}

/**
 * Takes a list of StartStopNotifiers and reduces them to a single call.
 * The return can be used as the second parameter in a Svelte store.
 *
 * This is provided as a backup in case a store has an existing
 * `StartStopNotifier`that you don't want to touch.
 * However it is probably better to convert the existing notifier
 * into a `StartStopObserver` instead.
 *
 * @see https://svelte.dev/docs#run-time-svelte-store-writable
 */
export function combinedStartStop<T>(list: StartStopNotifier<T>[]) {
  let stops: ReturnType<StartStopNotifier<T>>[];

  let start: StartStopNotifier<T> = (set) => {
    for (let item of list) {
      stops.push(item(set));
    }

    let stop: Unsubscriber = () => {
      for (let _stop of stops) {
        !!_stop && _stop();
      }
    };

    return stop;
  };

  return start;
}
