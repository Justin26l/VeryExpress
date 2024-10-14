// {{headerComment}}

import { generateToken } from "./../auth/jwt.gen";
import { UserDocument } from "./../../_models/UserModel.gen";

export default function returnToken(userProfile: UserDocument){
    const sanitizedProfile = sanitizeUser(userProfile);
    const tokenInfo = generateToken(sanitizedProfile);
    return {
        profile: sanitizedProfile, 
        tokenInfo: tokenInfo
    };
}

function sanitizeUser(user: UserDocument){
    return {
        _id: user._id,
        email: user.email,
        name: user.name,
        locale: user.locale,
        roles: user.roles,
        profileErrors: user.profileErrors,
        active: user.active
    };
}