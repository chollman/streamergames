import { useDispatch, useSelector } from "react-redux";

// Components should NEVER import react-redux directly — always go through
// these hooks. Once TS lands they become the typed variants.
export const useAppDispatch = useDispatch;
export const useAppSelector = useSelector;
