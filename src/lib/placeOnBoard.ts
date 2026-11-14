/**
 * Asks an open board to place a card, from anywhere (the Reader panel, the paste handler). The board owns
 * its items while it's open, so it places the card itself, at the middle of the view, with undo.
 */
export const PLACE_EVENT = "daiku:place";

export interface PlaceRequest {
  boardId: string;
  text: string;
  /** A claim card, when set. */
  claim?: string;
  /** A source card, when set. */
  asset_id?: string;
}

export const placeOnBoard = (request: PlaceRequest) => window.dispatchEvent(new CustomEvent<PlaceRequest>(PLACE_EVENT, { detail: request }));
